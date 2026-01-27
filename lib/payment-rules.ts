import { query } from './database'
import type { IntegrationEnvironment } from './integrations-types'

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
    return result.rows
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
      return result.rows[0]
    }
    return null
  } catch (error) {
    console.error('[Payment Rules] Erro ao buscar taxa de parcelamento:', error)
    return null
  }
}

/**
 * Calcula valor total com juros de parcelamento
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

  if (!rateData) {
    // Se não encontrou taxa, retorna sem juros
    return {
      rate: 0,
      totalWithInterest: originalValue,
      installmentValue: originalValue / installments,
      interestAmount: 0,
      hasInterest: false,
    }
  }

  const rate = parseFloat(rateData.rate_percentage.toString())
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
 * Calcula todas as opções de parcelamento com juros
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
  const results = []

  for (let i = 1; i <= maxInstallments; i++) {
    const rateData = rates.find(r => r.installments === i)
    const rate = rateData ? parseFloat(rateData.rate_percentage.toString()) : 0
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
