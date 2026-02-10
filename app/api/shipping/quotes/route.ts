import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { query } from '@/lib/database'

// Lista histórico de cotações de frete (protegido)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const per_page = parseInt(searchParams.get('per_page') || '10', 10)

    const offset = (page - 1) * per_page

    // Total de registros
    const countResult = await query('SELECT COUNT(*) AS total FROM shipping_quotes', [])
    const total = parseInt(countResult.rows[0].total, 10) || 0

    // Busca paginada (campos resumidos)
    const quotesResult = await query(
      `SELECT id, created_at, cep_destino, destination_state, order_value, free_shipping_applied, free_shipping_rule_id
       FROM shipping_quotes
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [per_page, offset]
    )

    const lastPage = Math.max(1, Math.ceil(total / per_page))

    return NextResponse.json({
      data: quotesResult.rows,
      current_page: page,
      per_page,
      total,
      last_page: lastPage,
      from: offset + 1,
      to: Math.min(offset + per_page, total),
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Shipping Quotes API] Erro ao listar cotações:', error)
    return NextResponse.json(
      { error: 'Erro ao listar histórico de cotações' },
      { status: 500 }
    )
  }
}

