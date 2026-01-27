import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getSettingAsNumber } from '@/lib/settings'
import { randomUUID } from 'crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = parseInt(params.id)
    
    if (isNaN(orderId)) {
      return NextResponse.json(
        { error: 'ID do pedido inválido' },
        { status: 400 }
      )
    }

    // Verificar se pedido existe
    const orderResult = await query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    )

    if (orderResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Pedido não encontrado' },
        { status: 404 }
      )
    }

    const order = orderResult.rows[0]

    // Verificar se pedido está aguardando pagamento
    if (order.status !== 'aguardando_pagamento') {
      return NextResponse.json(
        { error: 'Apenas pedidos aguardando pagamento podem ter link gerado' },
        { status: 400 }
      )
    }

    // Gerar token único
    const token = randomUUID()

    // Buscar tempo de expiração (padrão: 24 horas)
    const expiryHours = await getSettingAsNumber('payment_link_expiry_hours', 24)
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + expiryHours)

    // Salvar token e expiração no banco
    await query(
      `UPDATE orders 
       SET payment_link_token = $1,
           payment_link_expires_at = $2,
           payment_link_generated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [token, expiresAt, orderId]
    )

    // Construir URL base
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                   'http://localhost:3000'
    
    const paymentLink = `${baseUrl}/checkout/${orderId}?token=${token}`

    return NextResponse.json({
      success: true,
      payment_link: paymentLink,
      token,
      expires_at: expiresAt.toISOString(),
      expires_in_hours: expiryHours,
    })
  } catch (error: any) {
    console.error('Erro ao gerar link de pagamento:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao gerar link de pagamento' },
      { status: 500 }
    )
  }
}
