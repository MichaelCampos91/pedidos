import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { createPixTransaction, createCreditCardTransaction } from '@/lib/pagarme'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { order_id, payment_method, customer, billing, credit_card } = body

    if (!order_id || !payment_method || !customer) {
      return NextResponse.json(
        { error: 'Dados obrigatórios: order_id, payment_method, customer' },
        { status: 400 }
      )
    }

    // Buscar pedido
    const orderResult = await query(
      `SELECT o.*, c.name as client_name, c.email as client_email, c.cpf as client_cpf, c.phone as client_phone, c.whatsapp as client_whatsapp
       FROM orders o
       JOIN clients c ON o.client_id = c.id
       WHERE o.id = $1`,
      [order_id]
    )

    if (orderResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Pedido não encontrado' },
        { status: 404 }
      )
    }

    const order = orderResult.rows[0]

    if (order.status !== 'aguardando_pagamento') {
      return NextResponse.json(
        { error: 'Pedido já foi processado' },
        { status: 400 }
      )
    }

    // Buscar endereço de entrega
    let shippingAddress = null
    if (order.shipping_address_id) {
      const addressResult = await query(
        'SELECT * FROM client_addresses WHERE id = $1',
        [order.shipping_address_id]
      )
      shippingAddress = addressResult.rows[0] || null
    }

    // Preparar dados do cliente
    const cleanCPF = (customer.document || order.client_cpf).replace(/\D/g, '')
    const cleanPhone = (customer.phone || order.client_whatsapp || order.client_phone).replace(/\D/g, '')
    const areaCode = cleanPhone.substring(0, 2)
    const number = cleanPhone.substring(2)

    const customerData = {
      name: customer.name || order.client_name,
      email: customer.email || order.client_email,
      document: cleanCPF,
      phone: {
        country_code: '55',
        area_code: areaCode,
        number: number,
      },
    }

    // Preparar dados de cobrança
    const billingData = billing || shippingAddress ? {
      name: customer.name || order.client_name,
      address: {
        street: (billing?.address?.street || shippingAddress?.street || '').substring(0, 126),
        number: billing?.address?.number || shippingAddress?.number || 'S/N',
        complement: billing?.address?.complement || shippingAddress?.complement || '',
        neighborhood: billing?.address?.neighborhood || shippingAddress?.neighborhood || '',
        city: billing?.address?.city || shippingAddress?.city || '',
        state: billing?.address?.state || shippingAddress?.state || '',
        zip_code: (billing?.address?.zip_code || shippingAddress?.cep || '').replace(/\D/g, ''),
      },
    } : undefined

    // Criar transação
    const amount = Math.round(parseFloat(order.total) * 100) // Converter para centavos

    let transaction
    if (payment_method === 'pix') {
      transaction = await createPixTransaction({
        amount,
        payment_method: 'pix',
        customer: customerData,
        billing: billingData,
        metadata: {
          order_id: order_id.toString(),
        },
      })
    } else if (payment_method === 'credit_card') {
      transaction = await createCreditCardTransaction({
        amount,
        payment_method: 'credit_card',
        customer: customerData,
        billing: billingData,
        credit_card: credit_card || { installments: 1 },
        metadata: {
          order_id: order_id.toString(),
        },
      })
    } else {
      return NextResponse.json(
        { error: 'Método de pagamento inválido' },
        { status: 400 }
      )
    }

    // Salvar pagamento no banco
    await query(
      `INSERT INTO payments (order_id, pagarme_transaction_id, method, installments, amount, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        order_id,
        transaction.id,
        payment_method,
        credit_card?.installments || 1,
        order.total,
        transaction.status === 'paid' ? 'paid' : 'pending',
      ]
    )

    // Se pagamento foi aprovado imediatamente, atualizar pedido
    if (transaction.status === 'paid') {
      await query(
        'UPDATE orders SET status = $1, paid_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['aguardando_producao', order_id]
      )
    }

    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        status: transaction.status,
        payment_method,
        pix_qr_code: transaction.pix_qr_code,
        pix_expiration_date: transaction.pix_expiration_date,
      },
    })
  } catch (error: any) {
    console.error('Erro ao criar pagamento:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao processar pagamento' },
      { status: 500 }
    )
  }
}
