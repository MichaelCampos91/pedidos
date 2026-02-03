import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getSetting } from '@/lib/settings'
import type { IntegrationEnvironment } from '@/lib/integrations-types'

export const dynamic = 'force-dynamic'

/**
 * GET público (não exige autenticação): retorna taxas de parcelamento e parcela mínima para o checkout.
 * Usado pelo PaymentForm no link de pagamento; o cliente acessa sem login.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const env = searchParams.get('environment') || 'production'
    const environment = (env === 'sandbox' ? 'sandbox' : 'production') as IntegrationEnvironment

    const result = await query(
      `SELECT * FROM installment_rates 
       WHERE environment = $1 
       ORDER BY installments ASC`,
      [environment]
    )

    const rates = result.rows.map(row => ({
      ...row,
      rate_percentage: parseFloat(row.rate_percentage) || 0,
      installments: parseInt(row.installments) || 0,
      interest_free: row.interest_free === true,
    }))

    const minValueRaw = await getSetting('min_installment_value')
    const min_installment_value = minValueRaw != null && minValueRaw !== ''
      ? (() => { const n = parseFloat(minValueRaw); return Number.isFinite(n) && n >= 0 ? n : 0 })()
      : 0

    return NextResponse.json({ rates, min_installment_value })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar taxas de parcelamento'
    console.error('[Checkout Installment Rates] Erro:', error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
