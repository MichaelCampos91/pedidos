import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import type { IntegrationEnvironment } from '@/lib/integrations-types'

export const dynamic = 'force-dynamic'

/**
 * GET público: retorna taxas de parcelamento para o checkout.
 * Usado pelo PaymentForm sem autenticação (cliente paga via link).
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
    }))

    return NextResponse.json({ rates })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar taxas de parcelamento'
    console.error('[Checkout Installment Rates] Erro:', error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
