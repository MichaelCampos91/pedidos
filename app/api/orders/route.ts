import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { saveLog } from '@/lib/logger'

// Marca a rota como dinâmica porque usa cookies para autenticação
export const dynamic = 'force-dynamic'

// Lista pedidos (protegido)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const per_page = parseInt(searchParams.get('per_page') || '20')
    const status = searchParams.get('status')
    const payment_status = searchParams.get('payment_status')
    const search = searchParams.get('search')
    const start_date = searchParams.get('start_date')
    const end_date = searchParams.get('end_date')
    const sort = searchParams.get('sort') || 'created_at'
    const order = searchParams.get('order') || 'desc'

    const offset = (page - 1) * per_page
    const allowedSorts = ['created_at', 'total', 'status']
    const sortColumn = allowedSorts.includes(sort) ? sort : 'created_at'
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC'

    let whereClause = '1=1'
    const params: any[] = []
    let paramIndex = 1

    if (status) {
      whereClause += ` AND o.status = $${paramIndex}`
      params.push(status)
      paramIndex++
    }

    if (start_date && end_date) {
      whereClause += ` AND DATE(o.created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`
      params.push(start_date, end_date)
      paramIndex += 2
    }

    if (search) {
      const searchTerm = `%${search}%`
      whereClause += ` AND (o.id::text LIKE $${paramIndex} OR c.name LIKE $${paramIndex + 1} OR c.cpf LIKE $${paramIndex + 2})`
      params.push(searchTerm, searchTerm, searchTerm)
      paramIndex += 3
    }

    // Adicionar filtro de payment_status se fornecido
    let paymentStatusWhereClause = whereClause
    if (payment_status) {
      paymentStatusWhereClause += ` AND EXISTS (
        SELECT 1 FROM payments p
        WHERE p.order_id = o.id AND p.status = $${paramIndex}
      )`
      params.push(payment_status)
      paramIndex++
    }

    // Total de registros
    const countResult = await query(
      `SELECT COUNT(*) as total 
       FROM orders o
       JOIN clients c ON o.client_id = c.id
       WHERE ${paymentStatusWhereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0].total)

    // Busca paginada
    const queryText = `
      SELECT 
        o.*,
        c.name as client_name,
        c.cpf as client_cpf,
        c.whatsapp as client_whatsapp,
        pay.payment_status,
        pay.payment_method,
        pay.installments
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      LEFT JOIN LATERAL (
        SELECT p.status as payment_status, p.method as payment_method, p.installments
        FROM payments p
        WHERE p.order_id = o.id
        ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
        LIMIT 1
      ) pay ON true
      WHERE ${paymentStatusWhereClause}
      ORDER BY o.${sortColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    const queryParams = [...params, per_page, offset]
    const ordersResult = await query(queryText, queryParams)

    // Buscar itens para cada pedido
    const ordersWithItems = await Promise.all(
      ordersResult.rows.map(async (order) => {
        const itemsResult = await query(
          'SELECT * FROM order_items WHERE order_id = $1',
          [order.id]
        )
        return {
          ...order,
          items: itemsResult.rows,
          // Garantir que campos de payment_link existam (mesmo que null)
          payment_link_token: order.payment_link_token || null,
          payment_link_expires_at: order.payment_link_expires_at || null,
          payment_link_generated_at: order.payment_link_generated_at || null,
        }
      })
    )

    const lastPage = Math.ceil(total / per_page)

    return NextResponse.json({
      data: ordersWithItems,
      current_page: page,
      per_page,
      total,
      last_page: lastPage,
      from: offset + 1,
      to: Math.min(offset + per_page, total)
    })
  } catch (error: any) {
    console.error('Erro ao listar pedidos:', error)
    
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    
    // Se o erro for relacionado a colunas que não existem, dar mensagem mais clara
    if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
      return NextResponse.json(
        { 
          error: 'Erro ao listar pedidos: Campos do banco de dados não encontrados. Execute as migrações do schema.',
          details: error.message 
        },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { 
        error: 'Erro ao listar pedidos',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    )
  }
}

// Cria pedido (protegido)
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { 
      client_id, 
      items, 
      shipping_address_id,
      shipping_method,
      shipping_option_id,
      shipping_company_name,
      shipping_delivery_time,
      shipping_option_data,
      total_items,
      total_shipping,
      total
    } = body

    if (!client_id || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'Cliente e itens são obrigatórios' },
        { status: 400 }
      )
    }

    // Calcular totais se não fornecidos
    const calculatedTotalItems = total_items || items.reduce((sum: number, item: any) => {
      return sum + (parseFloat(item.price) * parseInt(item.quantity))
    }, 0)
    const calculatedShipping = total_shipping || 0
    const calculatedTotal = total || (calculatedTotalItems + calculatedShipping)

    // Criar pedido
    const orderResult = await query(
      `INSERT INTO orders (
        client_id, status, total_items, total_shipping, total, 
        shipping_address_id, shipping_method, shipping_option_id, 
        shipping_company_name, shipping_delivery_time, shipping_option_data
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        client_id, 
        'aguardando_pagamento', 
        calculatedTotalItems, 
        calculatedShipping,
        calculatedTotal,
        shipping_address_id || null,
        shipping_method || null,
        shipping_option_id || null,
        shipping_company_name || null,
        shipping_delivery_time || null,
        shipping_option_data ? JSON.stringify(shipping_option_data) : null
      ]
    )

    const orderId = orderResult.rows[0].id

    // Inserir itens
    for (const item of items) {
      await query(
        `INSERT INTO order_items (order_id, product_id, title, price, quantity, observations)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          orderId,
          item.product_id || null,
          item.title,
          parseFloat(item.price),
          parseInt(item.quantity),
          item.observations || null
        ]
      )
    }

    // Log de pedido criado
    await saveLog(
      'info',
      `Pedido #${orderId} criado`,
      {
        order_id: orderId,
        client_id,
        total_items: calculatedTotalItems,
        total_shipping: calculatedShipping,
        total: calculatedTotal,
        items_count: items.length,
      },
      'order'
    )

    return NextResponse.json({ success: true, id: orderId })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao criar pedido' },
      { status: 500 }
    )
  }
}
