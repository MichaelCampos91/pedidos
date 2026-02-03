import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { query } from '@/lib/database'
import { DEFAULT_INSTALLMENT_RATES } from '@/lib/payment-rules'
import type { IntegrationEnvironment } from '@/lib/integrations-types'

export const dynamic = 'force-dynamic'

/**
 * POST: Importa tabela de juros no padrão Pagar.me e grava em installment_rates.
 * A API Pagar.me v5 não expõe a tabela do estabelecimento; usa-se tabela padrão (1x–6x 0%, 7x–12x 1,99%).
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json().catch(() => ({}))
    const env = body.environment === 'sandbox' ? 'sandbox' : 'production'
    const environment = env as IntegrationEnvironment

    const rates = DEFAULT_INSTALLMENT_RATES.map(r => ({ ...r }))
    const now = new Date().toISOString()

    for (const rate of rates) {
      const { installments, rate_percentage } = rate
      if (!installments || rate_percentage === undefined) continue

      await query(
        `INSERT INTO installment_rates (installments, rate_percentage, source, environment, last_synced_at)
         VALUES ($1, $2, 'pagarme', $3, $4)
         ON CONFLICT (installments, environment)
         DO UPDATE SET
           rate_percentage = EXCLUDED.rate_percentage,
           source = 'pagarme',
           last_synced_at = EXCLUDED.last_synced_at,
           updated_at = CURRENT_TIMESTAMP`,
        [installments, rate_percentage, environment, now]
      )
    }

    return NextResponse.json({
      success: true,
      rates,
      message: `Tabela de juros importada: ${rates.length} parcelas atualizadas para o ambiente ${environment}.`,
    })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'message' in error) {
      const msg = (error as { message: string }).message
      if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
        return authErrorResponse(msg, 401)
      }
    }
    const message = error instanceof Error ? error.message : 'Erro ao importar tabela de juros'
    console.error('[Import Pagar.me Rates] Erro:', error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
