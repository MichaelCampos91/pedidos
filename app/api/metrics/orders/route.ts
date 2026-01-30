import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'

// Marca a rota como dinâmica porque usa cookies para autenticação
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const start_date = searchParams.get('start_date')
    const end_date = searchParams.get('end_date')

    let dateFilter = ''
    const params: any[] = []
    let paramIndex = 1

    if (start_date && end_date) {
      dateFilter = `WHERE DATE(created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`
      params.push(start_date, end_date)
      paramIndex += 2
    }

    // Total de pedidos
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM orders ${dateFilter}`,
      params
    )
    const total = parseInt(totalResult.rows[0].total)

    // Total de pedidos no período (se filtrado)
    const total_period = start_date && end_date ? total : total

    // Faturamento total
    const revenueResult = await query(
      `SELECT COALESCE(SUM(total), 0) as revenue FROM orders ${dateFilter}`,
      params
    )
    const revenue = parseFloat(revenueResult.rows[0].revenue || 0)

    // Faturamento no período
    const revenue_period = start_date && end_date ? revenue : revenue

    // Pedidos aguardando pagamento
    const awaitingPaymentResult = await query(
      `SELECT COUNT(*) as count FROM orders WHERE status = 'aguardando_pagamento' ${dateFilter.replace('WHERE', 'AND') || ''}`,
      params.length > 0 ? params : []
    )
    const awaiting_payment = parseInt(awaitingPaymentResult.rows[0].count)

    // Distribuição por status
    const byStatusResult = await query(
      `SELECT status, COUNT(*) as count 
       FROM orders 
       ${dateFilter}
       GROUP BY status
       ORDER BY count DESC`
    )
    const by_status = byStatusResult.rows.map((row: any) => ({
      status: row.status,
      count: parseInt(row.count)
    }))

    // Distribuição por forma de pagamento (pedidos com pagamento aprovado)
    const byPaymentResult = dateFilter
      ? await query(
          `SELECT p.method, COUNT(*) as count, COALESCE(SUM(p.amount), 0) as total
           FROM payments p
           JOIN orders o ON o.id = p.order_id
           WHERE p.status = 'paid' AND DATE(o.created_at) BETWEEN $1 AND $2
           GROUP BY p.method
           ORDER BY count DESC`,
          params
        )
      : await query(
          `SELECT p.method, COUNT(*) as count, COALESCE(SUM(p.amount), 0) as total
           FROM payments p
           WHERE p.status = 'paid'
           GROUP BY p.method
           ORDER BY count DESC`,
          []
        )
    const by_payment_method = byPaymentResult.rows.map((row: any) => ({
      method: row.method,
      count: parseInt(row.count),
      total: parseFloat(row.total || 0)
    }))

    return NextResponse.json({
      total,
      total_period,
      revenue,
      revenue_period,
      awaiting_payment,
      by_status,
      by_payment_method
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: 'Erro ao buscar métricas' },
      { status: 500 }
    )
  }
}
