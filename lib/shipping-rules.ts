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
 */
function ruleApplies(
  rule: ShippingRule,
  orderValue: number,
  destinationState?: string,
  shippingMethodId?: number
): boolean {
  // Verificar tipo de condição
  switch (rule.condition_type) {
    case 'all':
      return true

    case 'min_value':
      if (!rule.condition_value?.min_value) return false
      return orderValue >= parseFloat(rule.condition_value.min_value)

    case 'states':
      if (!rule.condition_value?.states || !Array.isArray(rule.condition_value.states)) return false
      if (!destinationState) return false
      return rule.condition_value.states.includes(destinationState.toUpperCase())

    case 'shipping_methods':
      if (!shippingMethodId) return false
      if (!rule.shipping_methods || rule.shipping_methods.length === 0) return true
      return rule.shipping_methods.includes(shippingMethodId)

    default:
      return false
  }
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

  for (const option of shippingOptions) {
    let finalPrice = parseFloat(option.price)
    let optionModified = false
    const optionAppliedRules: AppliedRule[] = []

    // Aplicar regras na ordem de prioridade
    for (const rule of rules) {
      // Verificar se regra se aplica
      if (!ruleApplies(rule, orderValue, destinationState, option.id)) {
        continue
      }

      // Aplicar regra de frete grátis
      if (rule.rule_type === 'free_shipping') {
        finalPrice = 0
        optionModified = true
        optionAppliedRules.push({
          ruleId: rule.id,
          ruleType: rule.rule_type,
          applied: true,
          originalPrice: parseFloat(option.price),
          finalPrice: 0,
        })
        break // Frete grátis tem prioridade máxima, para aplicação
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

    // Criar opção modificada
    const modifiedOption: ShippingOption = {
      ...option,
      price: finalPrice.toFixed(2),
    }

    // Adicionar dias de produção ao prazo
    if (productionDays > 0) {
      modifiedOption.delivery_time = option.delivery_time + productionDays
      if (modifiedOption.delivery_range) {
        modifiedOption.delivery_range.min = option.delivery_range.min + productionDays
        modifiedOption.delivery_range.max = option.delivery_range.max + productionDays
      }
    }

    modifiedOptions.push(modifiedOption)
    appliedRules.push(...optionAppliedRules)
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
