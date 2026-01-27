import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { query } from '@/lib/database'
import type { IntegrationEnvironment } from '@/lib/integrations-types'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const environment = (searchParams.get('environment') || 'production') as IntegrationEnvironment

    const result = await query(
      `SELECT * FROM installment_rates 
       WHERE environment = $1 
       ORDER BY installments ASC`,
      [environment]
    )

    return NextResponse.json({ rates: result.rows })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Installment Rates API] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar taxas de parcelamento' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { rates, environment = 'production' } = body

    if (!Array.isArray(rates)) {
      return NextResponse.json(
        { error: 'rates deve ser um array' },
        { status: 400 }
      )
    }

    // Validar ambiente
    if (environment !== 'sandbox' && environment !== 'production') {
      return NextResponse.json(
        { error: 'environment deve ser sandbox ou production' },
        { status: 400 }
      )
    }

    // Atualizar ou criar cada taxa
    for (const rate of rates) {
      const { installments, rate_percentage } = rate

      if (!installments || rate_percentage === undefined) {
        continue
      }

      await query(
        `INSERT INTO installment_rates (installments, rate_percentage, source, environment)
         VALUES ($1, $2, 'manual', $3)
         ON CONFLICT (installments, environment)
         DO UPDATE SET 
           rate_percentage = EXCLUDED.rate_percentage,
           source = 'manual',
           updated_at = CURRENT_TIMESTAMP`,
        [installments, rate_percentage, environment]
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Installment Rates API] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao salvar taxas de parcelamento' },
      { status: 500 }
    )
  }
}
