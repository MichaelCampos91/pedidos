import { query } from './database'
import { getSetting } from './settings'
import type { IntegrationEnvironment } from './integrations-types'

const MIN_INSTALLMENT_VALUE_KEY = 'min_installment_value'

/**
 * Retorna o valor mínimo por parcela (R$) configurado pelo admin.
 * Se for 0 ou não estiver definido, a regra de parcela mínima não se aplica.
 */
export async function getMinInstallmentValue(): Promise<number> {
  const value = await getSetting(MIN_INSTALLMENT_VALUE_KEY)
  if (!value) return 0
  const num = parseFloat(value)
  return Number.isFinite(num) && num >= 0 ? num : 0
}

export interface PaymentSetting {
  id: number
  payment_method: 'pix' | 'credit_card'
  setting_type: 'discount' | 'installment_interest'
  installments?: number | null
  discount_type?: 'percentage' | 'fixed' | null
  discount_value?: number | null
  active: boolean
}

export interface InstallmentRate {
  id: number
  installments: number
  rate_percentage: number
  interest_free?: boolean
  source: 'manual' | 'pagarme'
  environment: IntegrationEnvironment | null
  last_synced_at?: Date | null
}

/**
 * Busca configuração de desconto PIX
 */
export async function getPixDiscount(): Promise<PaymentSetting | null> {
  try {
    const result = await query(
      `SELECT * FROM payment_settings 
       WHERE payment_method = 'pix' 
       AND setting_type = 'discount' 
       AND active = true 
       LIMIT 1`
    )
    if (result.rows.length > 0) {
      return result.rows[0]
    }
    return null
  } catch (error) {
    console.error('[Payment Rules] Erro ao buscar desconto PIX:', error)
    return null
  }
}

/**
 * Calcula desconto PIX aplicado a um valor
 */
export async function calculatePixDiscount(originalValue: number): Promise<{
  discount: number
  finalValue: number
  discountType: 'percentage' | 'fixed' | null
}> {
  const pixSetting = await getPixDiscount()

  if (!pixSetting || !pixSetting.discount_type || pixSetting.discount_value === null || pixSetting.discount_value === undefined) {
    return {
      discount: 0,
      finalValue: originalValue,
      discountType: null,
    }
  }

  const discountValue = parseFloat(pixSetting.discount_value.toString())

  if (pixSetting.discount_type === 'percentage') {
    const discount = (originalValue * discountValue) / 100
    return {
      discount,
      finalValue: Math.max(0, originalValue - discount),
      discountType: 'percentage',
    }
  } else if (pixSetting.discount_type === 'fixed') {
    return {
      discount: discountValue,
      finalValue: Math.max(0, originalValue - discountValue),
      discountType: 'fixed',
    }
  }

  return {
    discount: 0,
    finalValue: originalValue,
    discountType: null,
  }
}

/**
 * Busca todas as taxas de parcelamento para um ambiente
 */
export async function getInstallmentRates(
  environment: IntegrationEnvironment = 'production'
): Promise<InstallmentRate[]> {
  try {
    const result = await query(
      `SELECT * FROM installment_rates 
       WHERE environment = $1 
       ORDER BY installments ASC`,
      [environment]
    )
    // Converter valores DECIMAL do PostgreSQL para números JavaScript
    return result.rows.map(row => ({
      ...row,
      rate_percentage: parseFloat(row.rate_percentage) || 0,
      installments: parseInt(row.installments) || 0,
      interest_free: row.interest_free === true,
    }))
  } catch (error) {
    console.error('[Payment Rules] Erro ao buscar taxas de parcelamento:', error)
    return []
  }
}

/**
 * Busca taxa de parcelamento específica
 */
export async function getInstallmentRate(
  installments: number,
  environment: IntegrationEnvironment = 'production'
): Promise<InstallmentRate | null> {
  try {
    const result = await query(
      `SELECT * FROM installment_rates 
       WHERE installments = $1 AND environment = $2 
       LIMIT 1`,
      [installments, environment]
    )
    if (result.rows.length > 0) {
      const row = result.rows[0]
      // Converter valores DECIMAL do PostgreSQL para números JavaScript
      return {
        ...row,
        rate_percentage: parseFloat(row.rate_percentage) || 0,
        installments: parseInt(row.installments) || 0,
        interest_free: row.interest_free === true,
      }
    }
    return null
  } catch (error) {
    console.error('[Payment Rules] Erro ao buscar taxa de parcelamento:', error)
    return null
  }
}

/**
 * Calcula valor total com juros de parcelamento.
 * Opção é sem juros só se: marcada "Sem Juros" (interest_free) e
 * (não há parcela mínima ou valor da parcela >= parcela mínima).
 */
export async function calculateInstallmentTotal(
  originalValue: number,
  installments: number,
  environment: IntegrationEnvironment = 'production'
): Promise<{
  rate: number
  totalWithInterest: number
  installmentValue: number
  interestAmount: number
  hasInterest: boolean
}> {
  if (installments <= 1) {
    return {
      rate: 0,
      totalWithInterest: originalValue,
      installmentValue: originalValue,
      interestAmount: 0,
      hasInterest: false,
    }
  }

  const rateData = await getInstallmentRate(installments, environment)
  const minInstallment = await getMinInstallmentValue()
  const installmentValueIfNoInterest = originalValue / installments

  const useZeroInterest =
    rateData?.interest_free === true &&
    (minInstallment === 0 || installmentValueIfNoInterest >= minInstallment)

  if (useZeroInterest) {
    return {
      rate: 0,
      totalWithInterest: originalValue,
      installmentValue: installmentValueIfNoInterest,
      interestAmount: 0,
      hasInterest: false,
    }
  }

  if (!rateData) {
    return {
      rate: 0,
      totalWithInterest: originalValue,
      installmentValue: originalValue / installments,
      interestAmount: 0,
      hasInterest: false,
    }
  }

  const rate = rateData.rate_percentage
  const totalWithInterest = originalValue * (1 + rate / 100)
  const installmentValue = totalWithInterest / installments
  const interestAmount = totalWithInterest - originalValue

  return {
    rate,
    totalWithInterest,
    installmentValue,
    interestAmount,
    hasInterest: rate > 0,
  }
}

/**
 * Calcula todas as opções de parcelamento com juros.
 * Opção é sem juros só se: marcada "Sem Juros" (interest_free) e
 * (não há parcela mínima ou valor da parcela >= parcela mínima).
 */
export async function calculateAllInstallments(
  originalValue: number,
  maxInstallments: number = 12,
  environment: IntegrationEnvironment = 'production'
): Promise<Array<{
  installments: number
  rate: number
  totalWithInterest: number
  installmentValue: number
  interestAmount: number
  hasInterest: boolean
}>> {
  const rates = await getInstallmentRates(environment)
  const minInstallment = await getMinInstallmentValue()
  const results = []

  for (let i = 1; i <= maxInstallments; i++) {
    const rateRow = rates.find(r => r.installments === i)
    const valuePerInstallment = originalValue / i
    const useZeroInterest =
      rateRow?.interest_free === true &&
      (minInstallment === 0 || valuePerInstallment >= minInstallment)
    const rate = useZeroInterest
      ? 0
      : (rateRow?.rate_percentage ?? 0)
    const totalWithInterest = originalValue * (1 + rate / 100)
    const installmentValue = totalWithInterest / i
    const interestAmount = totalWithInterest - originalValue

    results.push({
      installments: i,
      rate,
      totalWithInterest,
      installmentValue,
      interestAmount,
      hasInterest: rate > 0,
    })
  }

  return results
}

/**
 * Verifica se há desconto PIX ativo
 */
export async function hasPixDiscount(): Promise<boolean> {
  const pixSetting = await getPixDiscount()
  return pixSetting !== null
}

/**
 * Tarifas padrão para o modal "Aplicar Tarifas Padrão" (referência; editáveis pelo admin antes de confirmar).
 */
export const DEFAULT_INSTALLMENT_RATES: Array<{ installments: number; rate_percentage: number }> = [
  { installments: 1, rate_percentage: 4.37 },
  { installments: 2, rate_percentage: 6.28 },
  { installments: 3, rate_percentage: 7.68 },
  { installments: 4, rate_percentage: 9.08 },
  { installments: 5, rate_percentage: 10.48 },
  { installments: 6, rate_percentage: 11.88 },
  { installments: 7, rate_percentage: 13.57 },
  { installments: 8, rate_percentage: 14.97 },
  { installments: 9, rate_percentage: 16.37 },
  { installments: 10, rate_percentage: 17.77 },
  { installments: 11, rate_percentage: 19.17 },
  { installments: 12, rate_percentage: 20.57 },
]

/**
 * Recalcula o total do pedido a partir dos itens e do frete (fonte confiável no backend).
 * orderItems: array com { price, quantity }
 * totalShipping: valor do frete do pedido
 */
export function recalculateOrderTotal(
  orderItems: Array<{ price: string | number; quantity: number }>,
  totalShipping: number
): number {
  const totalItems = orderItems.reduce(
    (sum, item) => sum + parseFloat(String(item.price)) * (item.quantity || 1),
    0
  )
  return totalItems + (totalShipping || 0)
}
