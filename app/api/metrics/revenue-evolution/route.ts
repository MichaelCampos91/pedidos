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
    const group_by = searchParams.get('group_by') || 'day' // day, week, month, year
    const timezone = searchParams.get('timezone') || undefined

    if (!start_date || !end_date) {
      return NextResponse.json(
        { error: 'start_date e end_date são obrigatórios' },
        { status: 400 }
      )
    }

    const params: any[] = []
    let dateCondition = ''
    let dateGroupBy = ''

    // Construir condição de data e agrupamento conforme timezone
    if (timezone) {
      params.push(start_date, end_date, timezone)
      dateCondition = `(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date`
      
      switch (group_by) {
        case 'day':
          dateGroupBy = `DATE((o.created_at AT TIME ZONE 'UTC' AT TIME ZONE $3))`
          break
        case 'week':
          dateGroupBy = `DATE_TRUNC('week', (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE $3))`
          break
        case 'month':
          dateGroupBy = `DATE_TRUNC('month', (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE $3))`
          break
        case 'year':
          dateGroupBy = `DATE_TRUNC('year', (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE $3))`
          break
        default:
          dateGroupBy = `DATE((o.created_at AT TIME ZONE 'UTC' AT TIME ZONE $3))`
      }
    } else {
      params.push(start_date, end_date)
      dateCondition = `DATE(o.created_at) BETWEEN $1 AND $2`
      
      switch (group_by) {
        case 'day':
          dateGroupBy = `DATE(o.created_at)`
          break
        case 'week':
          dateGroupBy = `DATE_TRUNC('week', o.created_at)`
          break
        case 'month':
          dateGroupBy = `DATE_TRUNC('month', o.created_at)`
          break
        case 'year':
          dateGroupBy = `DATE_TRUNC('year', o.created_at)`
          break
        default:
          dateGroupBy = `DATE(o.created_at)`
      }
    }

    // Query para buscar faturamento agrupado
    const revenueResult = await query(
      `SELECT 
        ${dateGroupBy} as date,
        COALESCE(SUM(o.total), 0) as revenue
       FROM orders o
       WHERE o.paid_at IS NOT NULL AND ${dateCondition}
       GROUP BY ${dateGroupBy}
       ORDER BY date ASC`,
      params
    )

    const data = revenueResult.rows.map((row: any) => {
      let dateStr = ''
      if (row.date instanceof Date) {
        dateStr = row.date.toISOString().split('T')[0]
      } else if (typeof row.date === 'string') {
        // Se já é string, usar diretamente ou converter
        dateStr = row.date.split('T')[0]
      } else {
        // Se for outro formato, tentar converter
        dateStr = new Date(row.date).toISOString().split('T')[0]
      }
      return {
        date: dateStr,
        revenue: parseFloat(row.revenue || 0)
      }
    })

    return NextResponse.json(data)
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('Erro ao buscar evolução de faturamento:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar evolução de faturamento' },
      { status: 500 }
    )
  }
}
