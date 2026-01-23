import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'

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

    // Total de registros
    const countResult = await query(
      `SELECT COUNT(*) as total 
       FROM orders o
       JOIN clients c ON o.client_id = c.id
       WHERE ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0].total)

    // Busca paginada
    const queryText = `
      SELECT 
        o.*,
        c.name as client_name,
        c.cpf as client_cpf,
        c.whatsapp as client_whatsapp
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE ${whereClause}
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
          items: itemsResult.rows
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
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: 'Erro ao listar pedidos' },
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
    const { client_id, items, shipping_address_id } = body

    if (!client_id || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'Cliente e itens são obrigatórios' },
        { status: 400 }
      )
    }

    // Calcular totais
    const totalItems = items.reduce((sum: number, item: any) => {
      return sum + (parseFloat(item.price) * parseInt(item.quantity))
    }, 0)

    // Criar pedido
    const orderResult = await query(
      `INSERT INTO orders (client_id, status, total_items, total, shipping_address_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [client_id, 'aguardando_pagamento', totalItems, totalItems, shipping_address_id || null]
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

    return NextResponse.json({ success: true, id: orderId })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao criar pedido' },
      { status: 500 }
    )
  }
}
