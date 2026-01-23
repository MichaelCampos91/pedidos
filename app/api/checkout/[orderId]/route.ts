import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Busca dados do pedido para checkout (público)
export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const orderResult = await query(
      `SELECT o.*, c.name as client_name, c.cpf as client_cpf, c.whatsapp as client_whatsapp, c.email as client_email
       FROM orders o
       JOIN clients c ON o.client_id = c.id
       WHERE o.id = $1`,
      [params.orderId]
    )

    if (orderResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Pedido não encontrado' },
        { status: 404 }
      )
    }

    const order = orderResult.rows[0]

    // Verificar se o pedido já foi pago
    if (order.status !== 'aguardando_pagamento') {
      return NextResponse.json(
        { error: 'Este pedido já foi processado' },
        { status: 400 }
      )
    }

    // Buscar itens
    const itemsResult = await query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [params.orderId]
    )

    // Buscar endereços do cliente
    const addressesResult = await query(
      'SELECT * FROM client_addresses WHERE client_id = $1 ORDER BY is_default DESC, created_at ASC',
      [order.client_id]
    )

    // Buscar endereço de entrega selecionado
    let shippingAddress = null
    if (order.shipping_address_id) {
      const addressResult = await query(
        'SELECT * FROM client_addresses WHERE id = $1',
        [order.shipping_address_id]
      )
      shippingAddress = addressResult.rows[0] || null
    }

    return NextResponse.json({
      ...order,
      items: itemsResult.rows,
      addresses: addressesResult.rows,
      shipping_address: shippingAddress
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao buscar dados do checkout' },
      { status: 500 }
    )
  }
}

// Atualiza dados do checkout (público)
export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const body = await request.json()
    const { shipping_address_id } = body

    // Verificar se pedido existe e está aguardando pagamento
    const orderResult = await query('SELECT * FROM orders WHERE id = $1', [params.orderId])
    if (orderResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Pedido não encontrado' },
        { status: 404 }
      )
    }

    const order = orderResult.rows[0]
    if (order.status !== 'aguardando_pagamento') {
      return NextResponse.json(
        { error: 'Este pedido já foi processado' },
        { status: 400 }
      )
    }

    // Atualizar endereço de entrega
    if (shipping_address_id) {
      await query(
        'UPDATE orders SET shipping_address_id = $1 WHERE id = $2',
        [shipping_address_id, params.orderId]
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao atualizar checkout' },
      { status: 500 }
    )
  }
}
