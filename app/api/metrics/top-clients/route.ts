import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const start_date = searchParams.get('start_date')
    const end_date = searchParams.get('end_date')
    const timezone = searchParams.get('timezone') || undefined
    const limit = parseInt(searchParams.get('limit') || '10')

    let dateFilter = ''
    let dateCondition = ''
    let dateConditionO = ''
    const params: any[] = []
    let paramIndex = 1

    if (start_date && end_date) {
      if (timezone) {
        dateConditionO = `(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE $${paramIndex + 2})::date BETWEEN $${paramIndex}::date AND $${paramIndex + 1}::date`
        params.push(start_date, end_date, timezone)
        paramIndex += 3
      } else {
        dateConditionO = `DATE(o.created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`
        params.push(start_date, end_date)
        paramIndex += 2
      }
      dateFilter = `WHERE ${dateConditionO}`
    }

    // Query para buscar top clientes por faturamento
    const topClientsResult = dateFilter
      ? await query(
          `SELECT 
            c.id as client_id,
            c.name as client_name,
            COUNT(o.id) as order_count,
            COALESCE(SUM(o.total), 0) as total_revenue
           FROM orders o
           JOIN clients c ON c.id = o.client_id
           WHERE o.paid_at IS NOT NULL AND ${dateConditionO}
           GROUP BY c.id, c.name
           ORDER BY total_revenue DESC
           LIMIT $${paramIndex}`,
          [...params, limit]
        )
      : await query(
          `SELECT 
            c.id as client_id,
            c.name as client_name,
            COUNT(o.id) as order_count,
            COALESCE(SUM(o.total), 0) as total_revenue
           FROM orders o
           JOIN clients c ON c.id = o.client_id
           WHERE o.paid_at IS NOT NULL
           GROUP BY c.id, c.name
           ORDER BY total_revenue DESC
           LIMIT $1`,
          [limit]
        )

    const top_clients = topClientsResult.rows.map((row: any) => ({
      client_id: parseInt(row.client_id),
      client_name: row.client_name || 'Cliente sem nome',
      order_count: parseInt(row.order_count),
      total_revenue: parseFloat(row.total_revenue || 0)
    }))

    return NextResponse.json(top_clients)
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('Erro ao buscar top clientes:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar top clientes' },
      { status: 500 }
    )
  }
}
