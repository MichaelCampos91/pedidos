import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'

// Busca pedido por ID (protegido)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const orderResult = await query(
      `SELECT o.*, c.name as client_name, c.cpf as client_cpf, c.whatsapp as client_whatsapp, c.email as client_email
       FROM orders o
       JOIN clients c ON o.client_id = c.id
       WHERE o.id = $1`,
      [params.id]
    )

    if (orderResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Pedido não encontrado' },
        { status: 404 }
      )
    }

    const order = orderResult.rows[0]

    // Buscar itens
    const itemsResult = await query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [params.id]
    )

    // Buscar endereço de entrega
    let shippingAddress = null
    if (order.shipping_address_id) {
      const addressResult = await query(
        'SELECT * FROM client_addresses WHERE id = $1',
        [order.shipping_address_id]
      )
      shippingAddress = addressResult.rows[0] || null
    }

    // Buscar pagamentos
    const paymentsResult = await query(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC',
      [params.id]
    )

    return NextResponse.json({
      ...order,
      items: itemsResult.rows,
      shipping_address: shippingAddress,
      payments: paymentsResult.rows,
      // Campos de frete já estão incluídos em ...order
      shipping_option_data: order.shipping_option_data ? (typeof order.shipping_option_data === 'string' 
        ? JSON.parse(order.shipping_option_data) 
        : order.shipping_option_data) : null
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: 'Erro ao buscar pedido' },
      { status: 500 }
    )
  }
}

// Atualiza pedido (protegido)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    const user = await requireAuth(request, cookieToken)

    const body = await request.json()
    const { 
      status, 
      items, 
      total_items, 
      total_shipping, 
      total, 
      shipping_tracking,
      shipping_method,
      shipping_option_id,
      shipping_company_name,
      shipping_delivery_time,
      shipping_option_data,
      shipping_address_id
    } = body

    // Buscar pedido atual
    const currentOrderResult = await query('SELECT * FROM orders WHERE id = $1', [params.id])
    if (currentOrderResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Pedido não encontrado' },
        { status: 404 }
      )
    }

    const currentOrder = currentOrderResult.rows[0]

    // Regra de negócio: se já estiver enviado, não permitir alteração de status
    if (currentOrder.status === 'enviado' && status && status !== currentOrder.status) {
      return NextResponse.json(
        { error: 'Status não pode ser alterado após o pedido ser marcado como enviado.' },
        { status: 400 }
      )
    }

    // Se novo status for "enviado", exigir código/link de rastreio
    if (status === 'enviado' && (!shipping_tracking || String(shipping_tracking).trim() === '')) {
      return NextResponse.json(
        { error: 'Código ou link de rastreio é obrigatório para o status Enviado.' },
        { status: 400 }
      )
    }

    // Registrar mudanças no histórico
    if (status && status !== currentOrder.status) {
      await query(
        `INSERT INTO order_history (order_id, field_changed, old_value, new_value, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [params.id, 'status', currentOrder.status, status, user.id]
      )
    }

    // Atualizar pedido
    const updateFields: string[] = []
    const updateValues: any[] = []
    let paramIndex = 1

    if (status !== undefined) {
      updateFields.push(`status = $${paramIndex}`)
      updateValues.push(status)
      paramIndex++
    }

    if (total_items !== undefined) {
      updateFields.push(`total_items = $${paramIndex}`)
      updateValues.push(total_items)
      paramIndex++
    }

    if (total_shipping !== undefined) {
      updateFields.push(`total_shipping = $${paramIndex}`)
      updateValues.push(total_shipping)
      paramIndex++
    }

    if (total !== undefined) {
      updateFields.push(`total = $${paramIndex}`)
      updateValues.push(total)
      paramIndex++
    }

    if (shipping_tracking !== undefined) {
      updateFields.push(`shipping_tracking = $${paramIndex}`)
      updateValues.push(shipping_tracking)
      paramIndex++
    }

    if (shipping_method !== undefined) {
      updateFields.push(`shipping_method = $${paramIndex}`)
      updateValues.push(shipping_method)
      paramIndex++
    }

    if (shipping_option_id !== undefined) {
      updateFields.push(`shipping_option_id = $${paramIndex}`)
      updateValues.push(shipping_option_id)
      paramIndex++
    }

    if (shipping_company_name !== undefined) {
      updateFields.push(`shipping_company_name = $${paramIndex}`)
      updateValues.push(shipping_company_name)
      paramIndex++
    }

    if (shipping_delivery_time !== undefined) {
      updateFields.push(`shipping_delivery_time = $${paramIndex}`)
      updateValues.push(shipping_delivery_time)
      paramIndex++
    }

    if (shipping_option_data !== undefined) {
      updateFields.push(`shipping_option_data = $${paramIndex}`)
      updateValues.push(shipping_option_data ? JSON.stringify(shipping_option_data) : null)
      paramIndex++
    }

    if (shipping_address_id !== undefined) {
      updateFields.push(`shipping_address_id = $${paramIndex}`)
      updateValues.push(shipping_address_id)
      paramIndex++
    }

    if (updateFields.length > 0) {
      updateValues.push(params.id)
      await query(
        `UPDATE orders SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        updateValues
      )
    }

    // Atualizar itens se fornecidos
    if (items && Array.isArray(items)) {
      // Remover itens existentes
      await query('DELETE FROM order_items WHERE order_id = $1', [params.id])

      // Inserir novos itens
      for (const item of items) {
        await query(
          `INSERT INTO order_items (order_id, product_id, title, price, quantity, observations)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            params.id,
            item.product_id || null,
            item.title,
            parseFloat(item.price),
            parseInt(item.quantity),
            item.observations || null
          ]
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao atualizar pedido' },
      { status: 500 }
    )
  }
}
