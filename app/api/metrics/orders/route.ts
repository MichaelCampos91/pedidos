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
    const timezone = searchParams.get('timezone') || undefined

    let dateFilter = ''
    let dateCondition = ''
    let dateConditionO = ''
    const params: any[] = []
    let paramIndex = 1

    if (start_date && end_date) {
      if (timezone) {
        dateCondition = `(created_at AT TIME ZONE 'UTC' AT TIME ZONE $${paramIndex + 2})::date BETWEEN $${paramIndex}::date AND $${paramIndex + 1}::date`
        dateConditionO = `(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE $${paramIndex + 2})::date BETWEEN $${paramIndex}::date AND $${paramIndex + 1}::date`
        params.push(start_date, end_date, timezone)
        paramIndex += 3
      } else {
        dateCondition = `DATE(created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`
        dateConditionO = `DATE(o.created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`
        params.push(start_date, end_date)
        paramIndex += 2
      }
      dateFilter = `WHERE ${dateCondition}`
    }

    // Total de pedidos
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM orders ${dateFilter}`,
      params
    )
    const total = parseInt(totalResult.rows[0].total)

    // Total de pedidos no período (se filtrado)
    const total_period = start_date && end_date ? total : total

    // Faturamento total (apenas pedidos pagos)
    const revenueResult = await query(
      dateFilter
        ? `SELECT COALESCE(SUM(total), 0) as revenue FROM orders ${dateFilter} AND paid_at IS NOT NULL`
        : `SELECT COALESCE(SUM(total), 0) as revenue FROM orders WHERE paid_at IS NOT NULL`,
      params.length > 0 ? params : []
    )
    const revenue = parseFloat(revenueResult.rows[0].revenue || 0)

    // Faturamento no período
    const revenue_period = start_date && end_date ? revenue : revenue

    // Pedidos aguardando pagamento
    const awaitingPaymentResult = await query(
      `SELECT COUNT(*) as count FROM orders WHERE status = 'aguardando_pagamento' ${dateCondition ? `AND ${dateCondition}` : ''}`,
      params.length > 0 ? params : []
    )
    const awaiting_payment = parseInt(awaitingPaymentResult.rows[0].count)

    // Distribuição por status
    const byStatusResult = await query(
      `SELECT status, COUNT(*) as count 
       FROM orders 
       ${dateFilter}
       GROUP BY status
       ORDER BY count DESC`,
      params
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
           WHERE p.status = 'paid' AND ${dateConditionO}
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

    // Pedidos pagos (criados no período com paid_at preenchido)
    const paidCountResult = await query(
      dateFilter
        ? `SELECT COUNT(*) as count FROM orders ${dateFilter} AND paid_at IS NOT NULL`
        : `SELECT COUNT(*) as count FROM orders WHERE paid_at IS NOT NULL`,
      params.length > 0 ? params : []
    )
    const paid_count = parseInt(paidCountResult.rows[0].count)

    const average_order_value = paid_count > 0 ? revenue / paid_count : 0
    const conversion_rate = total > 0 ? paid_count / total : 0

    // Novos clientes no período
    let new_clients_count = 0
    if (params.length > 0) {
      const newClientsResult = await query(
        `SELECT COUNT(*) as count FROM clients WHERE ${dateCondition}`,
        params
      )
      new_clients_count = parseInt(newClientsResult.rows[0].count)
    }

    // Tempo médio até pagamento (horas)
    let avg_hours_to_payment: number | null = null
    if (params.length > 0) {
      const avgPaymentResult = await query(
        `SELECT AVG(EXTRACT(EPOCH FROM (paid_at - created_at))/3600) as avg_hours
         FROM orders WHERE ${dateCondition} AND paid_at IS NOT NULL`,
        params
      )
      const avgHours = avgPaymentResult.rows[0]?.avg_hours
      avg_hours_to_payment = avgHours != null ? parseFloat(avgHours) : null
    }

    // Frete total e médio
    const shippingResult = dateFilter
      ? await query(
          `SELECT COALESCE(SUM(total_shipping), 0) as total, AVG(COALESCE(total_shipping, 0)) as avg FROM orders ${dateFilter}`,
          params
        )
      : await query(
          `SELECT COALESCE(SUM(total_shipping), 0) as total, AVG(COALESCE(total_shipping, 0)) as avg FROM orders`,
          []
        )
    const shipping_total = parseFloat(shippingResult.rows[0].total || 0)
    const shipping_avg = parseFloat(shippingResult.rows[0].avg || 0)

    // À vista vs parcelado (por orders.created_at no período)
    const avistaResult = dateFilter
      ? await query(
          `SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p JOIN orders o ON o.id = p.order_id
           WHERE p.status = 'paid' AND p.installments = 1 AND ${dateConditionO}`,
          params
        )
      : await query(
          `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid' AND installments = 1`,
          []
        )
    const revenue_avista = parseFloat(avistaResult.rows[0].total || 0)

    const parceladoResult = dateFilter
      ? await query(
          `SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p JOIN orders o ON o.id = p.order_id
           WHERE p.status = 'paid' AND p.installments > 1 AND ${dateConditionO}`,
          params
        )
      : await query(
          `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid' AND installments > 1`,
          []
        )
    const revenue_parcelado = parseFloat(parceladoResult.rows[0].total || 0)

    // Top produtos (por quantidade vendida no período)
    const topProductsResult = dateFilter
      ? await query(
          `SELECT oi.product_id, oi.title, SUM(oi.quantity) as quantity, SUM(oi.price * oi.quantity) as revenue
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE ${dateConditionO}
           GROUP BY oi.product_id, oi.title ORDER BY quantity DESC LIMIT 10`,
          params
        )
      : await query(
          `SELECT oi.product_id, oi.title, SUM(oi.quantity) as quantity, SUM(oi.price * oi.quantity) as revenue
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           GROUP BY oi.product_id, oi.title ORDER BY quantity DESC LIMIT 10`,
          []
        )
    const top_products = topProductsResult.rows.map((row: any) => ({
      product_id: row.product_id,
      title: row.title || 'Sem título',
      quantity: parseInt(row.quantity),
      revenue: parseFloat(row.revenue || 0)
    }))

    // Vendas por estado (pedidos com shipping_address_id)
    const byStateResult = dateFilter
      ? await query(
          `SELECT a.state, COUNT(o.id) as count, COALESCE(SUM(o.total), 0) as total
           FROM orders o JOIN client_addresses a ON o.shipping_address_id = a.id
           WHERE ${dateConditionO}
           GROUP BY a.state ORDER BY count DESC`,
          params
        )
      : await query(
          `SELECT a.state, COUNT(o.id) as count, COALESCE(SUM(o.total), 0) as total
           FROM orders o JOIN client_addresses a ON o.shipping_address_id = a.id
           GROUP BY a.state ORDER BY count DESC`,
          []
        )
    const by_state = byStateResult.rows.map((row: any) => ({
      state: row.state,
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
      by_payment_method,
      paid_count,
      average_order_value,
      conversion_rate,
      new_clients_count,
      avg_hours_to_payment,
      shipping_total,
      shipping_avg,
      revenue_avista,
      revenue_parcelado,
      top_products,
      by_state
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
