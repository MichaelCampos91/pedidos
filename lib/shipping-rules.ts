import { query } from './database'

export interface ShippingRule {
  id: number
  rule_type: 'free_shipping' | 'discount' | 'surcharge' | 'production_days'
  condition_type: 'all' | 'min_value' | 'states' | 'shipping_methods'
  condition_value: any // JSONB
  discount_type?: 'percentage' | 'fixed'
  discount_value?: number
  shipping_methods?: number[] | null
  production_days?: number
  priority: number
  active: boolean
}

export interface ShippingOption {
  id: number
  name: string
  company: {
    id: number
    name: string
  }
  price: string
  currency: string
  delivery_time: number
  delivery_range?: {
    min: number
    max: number
  }
  packages: number
  originalPrice?: number  // Preço original antes do frete grátis
}

export interface ApplyRulesParams {
  shippingOptions: ShippingOption[]
  orderValue: number
  destinationState?: string
  destinationCep?: string
}

export interface AppliedRule {
  ruleId: number
  ruleType: string
  applied: boolean
  originalPrice?: number
  finalPrice?: number
  discount?: number
  surcharge?: number
  productionDaysAdded?: number
}

/**
 * Busca todas as regras de frete ativas ordenadas por prioridade
 */
export async function getActiveShippingRules(): Promise<ShippingRule[]> {
  try {
    const result = await query(
      `SELECT * FROM shipping_rules 
       WHERE active = true 
       ORDER BY priority ASC, created_at ASC`
    )
    return result.rows.map(row => ({
      ...row,
      condition_value: row.condition_value ? (typeof row.condition_value === 'string' ? JSON.parse(row.condition_value) : row.condition_value) : null,
      shipping_methods: row.shipping_methods ? (typeof row.shipping_methods === 'string' ? JSON.parse(row.shipping_methods) : row.shipping_methods) : null,
    }))
  } catch (error) {
    console.error('[Shipping Rules] Erro ao buscar regras:', error)
    return []
  }
}

/**
 * Busca configuração de prazo de produção
 */
export async function getProductionDays(): Promise<number> {
  try {
    const result = await query(
      `SELECT value FROM system_settings WHERE key = 'production_days'`
    )
    if (result.rows.length > 0) {
      return parseInt(result.rows[0].value) || 0
    }
    return 0
  } catch (error) {
    console.error('[Shipping Rules] Erro ao buscar prazo de produção:', error)
    return 0
  }
}

/**
 * Verifica se uma regra se aplica baseado nas condições
 * Suporta múltiplas condições combinadas com lógica AND
 */
function ruleApplies(
  rule: ShippingRule,
  orderValue: number,
  destinationState?: string,
  shippingMethodId?: number
): boolean {
  // Se condition_type é 'all' ou condition_value está vazio/null, aplicar para todos
  if (rule.condition_type === 'all' || !rule.condition_value || 
      (typeof rule.condition_value === 'object' && Object.keys(rule.condition_value).length === 0)) {
    return true
  }

  const conditionValue = rule.condition_value || {}
  let allConditionsMet = true

  // Verificar valor mínimo (se presente)
  if (conditionValue.min_value !== undefined && conditionValue.min_value !== null) {
    const minValue = parseFloat(conditionValue.min_value)
    if (isNaN(minValue) || orderValue < minValue) {
      return false // Condição não atendida
    }
  }

  // Verificar estados (se presente)
  if (conditionValue.states !== undefined && conditionValue.states !== null) {
    const states = Array.isArray(conditionValue.states) ? conditionValue.states : []
    if (states.length > 0) {
      if (!destinationState) {
        return false // Estado é obrigatório mas não foi fornecido
      }
      const stateUpper = destinationState.toUpperCase()
      if (!states.includes(stateUpper)) {
        return false // Estado não está na lista permitida
      }
    }
  }

  // Verificar modalidades de frete (se presente)
  // Pode estar em condition_value.shipping_methods ou no campo separado rule.shipping_methods
  const shippingMethods = conditionValue.shipping_methods || rule.shipping_methods
  if (shippingMethods !== undefined && shippingMethods !== null) {
    const methods = Array.isArray(shippingMethods) ? shippingMethods : []
    if (methods.length > 0) {
      if (!shippingMethodId) {
        return false // Modalidade é obrigatória mas não foi fornecida
      }
      if (!methods.includes(shippingMethodId)) {
        return false // Modalidade não está na lista permitida
      }
    }
  }

  // Compatibilidade com formato antigo (baseado em condition_type)
  // Se nenhuma condição específica foi encontrada em condition_value,
  // verificar condition_type como fallback
  const hasSpecificConditions = 
    conditionValue.min_value !== undefined ||
    (conditionValue.states !== undefined && Array.isArray(conditionValue.states) && conditionValue.states.length > 0) ||
    (conditionValue.shipping_methods !== undefined && Array.isArray(conditionValue.shipping_methods) && conditionValue.shipping_methods.length > 0) ||
    (rule.shipping_methods !== undefined && rule.shipping_methods !== null && Array.isArray(rule.shipping_methods) && rule.shipping_methods.length > 0)

  if (!hasSpecificConditions) {
    // Fallback para formato antigo baseado em condition_type
    switch (rule.condition_type) {
      case 'min_value':
        if (!conditionValue.min_value) return false
        return orderValue >= parseFloat(conditionValue.min_value)

      case 'states':
        if (!conditionValue.states || !Array.isArray(conditionValue.states)) return false
        if (!destinationState) return false
        return conditionValue.states.includes(destinationState.toUpperCase())

      case 'shipping_methods':
        if (!shippingMethodId) return false
        if (!rule.shipping_methods || rule.shipping_methods.length === 0) return true
        return rule.shipping_methods.includes(shippingMethodId)

      default:
        return true
    }
  }

  // Se chegou aqui, todas as condições foram atendidas
  return allConditionsMet
}

/**
 * Aplica uma regra de desconto/acréscimo ao preço do frete
 */
function applyDiscountOrSurcharge(
  price: number,
  rule: ShippingRule
): { finalPrice: number; discount?: number; surcharge?: number } {
  if (!rule.discount_type || rule.discount_value === undefined || rule.discount_value === null) {
    return { finalPrice: price }
  }

  const discountValue = parseFloat(rule.discount_value.toString())

  if (rule.discount_type === 'percentage') {
    const discount = (price * discountValue) / 100
    if (rule.rule_type === 'discount') {
      return {
        finalPrice: Math.max(0, price - discount),
        discount: discount,
      }
    } else if (rule.rule_type === 'surcharge') {
      return {
        finalPrice: price + discount,
        surcharge: discount,
      }
    }
  } else if (rule.discount_type === 'fixed') {
    if (rule.rule_type === 'discount') {
      return {
        finalPrice: Math.max(0, price - discountValue),
        discount: discountValue,
      }
    } else if (rule.rule_type === 'surcharge') {
      return {
        finalPrice: price + discountValue,
        surcharge: discountValue,
      }
    }
  }

  return { finalPrice: price }
}

/**
 * Aplica todas as regras de frete às opções de frete
 * Frete grátis é aplicado apenas à opção mais barata (após descontos/acréscimos)
 */
export async function applyShippingRules(
  params: ApplyRulesParams
): Promise<{
  options: ShippingOption[]
  appliedRules: AppliedRule[]
  productionDaysAdded: number
}> {
  const { shippingOptions, orderValue, destinationState, destinationCep } = params

  // Buscar regras ativas
  const rules = await getActiveShippingRules()
  const productionDays = await getProductionDays()

  const appliedRules: AppliedRule[] = []
  const modifiedOptions: ShippingOption[] = []

  // PRIMEIRA PASSADA: Aplicar apenas descontos/acréscimos (sem frete grátis)
  for (const option of shippingOptions) {
    let finalPrice = parseFloat(option.price)
    let optionModified = false
    const optionAppliedRules: AppliedRule[] = []

    // Aplicar regras de desconto/acréscimo na ordem de prioridade
    for (const rule of rules) {
      // Verificar se regra se aplica
      if (!ruleApplies(rule, orderValue, destinationState, option.id)) {
        continue
      }

      // Pular regras de frete grátis nesta primeira passada
      if (rule.rule_type === 'free_shipping') {
        continue
      }

      // Aplicar desconto ou acréscimo
      if (rule.rule_type === 'discount' || rule.rule_type === 'surcharge') {
        const result = applyDiscountOrSurcharge(finalPrice, rule)
        if (result.finalPrice !== finalPrice) {
          finalPrice = result.finalPrice
          optionModified = true
          optionAppliedRules.push({
            ruleId: rule.id,
            ruleType: rule.rule_type,
            applied: true,
            originalPrice: parseFloat(option.price),
            finalPrice: result.finalPrice,
            discount: result.discount,
            surcharge: result.surcharge,
          })
        }
      }
    }

    // Criar opção modificada (após descontos/acréscimos)
    const modifiedOption: ShippingOption = {
      ...option,
      price: finalPrice.toFixed(2),
    }

    // Adicionar dias de produção ao prazo
    if (productionDays > 0) {
      modifiedOption.delivery_time = option.delivery_time + productionDays
      if (modifiedOption.delivery_range && option.delivery_range) {
        modifiedOption.delivery_range.min = option.delivery_range.min + productionDays
        modifiedOption.delivery_range.max = option.delivery_range.max + productionDays
      }
    }

    modifiedOptions.push(modifiedOption)
    appliedRules.push(...optionAppliedRules)
  }

  // SEGUNDA PASSADA: Identificar opção mais barata e aplicar frete grátis apenas a ela
  if (modifiedOptions.length > 0) {
    // Encontrar opção mais barata (após descontos/acréscimos)
    const cheapestOption = modifiedOptions.reduce((cheapest, current) => {
      const cheapestPrice = parseFloat(cheapest.price)
      const currentPrice = parseFloat(current.price)
      return currentPrice < cheapestPrice ? current : cheapest
    })

    // Verificar se há regra de frete grátis aplicável à opção mais barata
    const freeShippingRules = rules.filter(r => r.rule_type === 'free_shipping')
    for (const rule of freeShippingRules) {
      if (ruleApplies(rule, orderValue, destinationState, cheapestOption.id)) {
        // Aplicar frete grátis apenas à opção mais barata
        const cheapestPrice = parseFloat(cheapestOption.price)
        cheapestOption.originalPrice = cheapestPrice
        cheapestOption.price = '0.00'
        
        // Registrar regra aplicada
        appliedRules.push({
          ruleId: rule.id,
          ruleType: rule.rule_type,
          applied: true,
          originalPrice: cheapestPrice,
          finalPrice: 0,
        })
        
        break // Apenas uma regra de frete grátis por vez
      }
    }
  }

  return {
    options: modifiedOptions,
    appliedRules,
    productionDaysAdded: productionDays,
  }
}

/**
 * Verifica se há frete grátis aplicável
 */
export async function hasFreeShipping(
  orderValue: number,
  destinationState?: string
): Promise<boolean> {
  const rules = await getActiveShippingRules()
  return rules.some(
    rule =>
      rule.rule_type === 'free_shipping' &&
      ruleApplies(rule, orderValue, destinationState)
  )
}

/**
 * Calcula o desconto total aplicável ao frete
 */
export async function calculateShippingDiscount(
  originalPrice: number,
  orderValue: number,
  destinationState?: string,
  shippingMethodId?: number
): Promise<number> {
  const rules = await getActiveShippingRules()
  let discount = 0

  for (const rule of rules) {
    if (
      rule.rule_type === 'discount' &&
      ruleApplies(rule, orderValue, destinationState, shippingMethodId)
    ) {
      const result = applyDiscountOrSurcharge(originalPrice - discount, rule)
      if (result.discount) {
        discount += result.discount
      }
    }
  }

  return discount
}
