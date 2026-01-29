import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { query } from '@/lib/database'
import { saveLog } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    // Ler body bruto para validação de assinatura (body só pode ser lido uma vez)
    const rawBody = await request.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    // Validar assinatura do webhook quando PAGARME_WEBHOOK_SECRET estiver configurado
    const webhookSecret = process.env.PAGARME_WEBHOOK_SECRET
    if (webhookSecret) {
      const signature = request.headers.get('x-pagar-me-signature')
      if (!signature || !signature.trim()) {
        await saveLog('warning', 'Webhook Pagar.me rejeitado: assinatura ausente', {})
        return NextResponse.json({ error: 'Assinatura do webhook ausente' }, { status: 401 })
      }
      const expectedSignature = createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex')
      const receivedSignature = signature.replace(/^sha256=/i, '').trim().toLowerCase()
      if (receivedSignature !== expectedSignature.toLowerCase()) {
        await saveLog('warning', 'Webhook Pagar.me rejeitado: assinatura inválida', {})
        return NextResponse.json({ error: 'Assinatura do webhook inválida' }, { status: 401 })
      }
    }

    // Processar evento do Pagar.me
    const event = (body.type ?? body.event) as string | undefined
    type WebhookData = Record<string, unknown> & {
      metadata?: { order_id?: string }
      order?: { metadata?: { order_id?: string } }
      id?: string
      charge?: { id?: string; status?: string; last_transaction?: { status?: string } }
    }
    const data = (body.data ?? body) as WebhookData

    if (!event || !data) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    // Buscar order_id no metadata
    const orderId = data.metadata?.order_id ?? data.order?.metadata?.order_id

    if (!orderId) {
      await saveLog('warning', 'Webhook Pagar.me sem order_id', { body })
      return NextResponse.json({ error: 'order_id não encontrado' }, { status: 400 })
    }

    // Verificar status do pagamento
    const charge = (data.charge ?? data) as WebhookData['charge'] & { id?: string }
    const status = charge?.status ?? (charge as { last_transaction?: { status?: string } })?.last_transaction?.status

    if (!status) {
      await saveLog('warning', 'Webhook Pagar.me sem status', { body })
      return NextResponse.json({ error: 'Status não encontrado' }, { status: 400 })
    }

    // Buscar pagamento no banco
    const paymentResult = await query(
      'SELECT * FROM payments WHERE pagarme_transaction_id = $1 OR order_id = $2 ORDER BY created_at DESC LIMIT 1',
      [data.id || charge.id, orderId]
    )

    if (paymentResult.rows.length === 0) {
      await saveLog('warning', 'Pagamento não encontrado no webhook', { orderId, transactionId: data.id })
      return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 })
    }

    const payment = paymentResult.rows[0]

    // Atualizar status do pagamento
    let paymentStatus = 'pending'
    if (status === 'paid' || status === 'captured') {
      paymentStatus = 'paid'
    } else if (status === 'refused' || status === 'failed') {
      paymentStatus = 'failed'
    } else if (status === 'pending') {
      paymentStatus = 'pending'
    }

    await query(
      `UPDATE payments 
       SET status = $1, paid_at = $2
       WHERE id = $3`,
      [
        paymentStatus,
        paymentStatus === 'paid' ? new Date() : null,
        payment.id,
      ]
    )

    // Se pagamento foi confirmado, atualizar pedido
    if (paymentStatus === 'paid' && payment.status !== 'paid') {
      await query(
        `UPDATE orders 
         SET status = $1, paid_at = CURRENT_TIMESTAMP 
         WHERE id = $2 AND status = 'aguardando_pagamento'`,
        ['aguardando_producao', payment.order_id]
      )

      await saveLog('info', 'Pagamento confirmado via webhook', {
        orderId: payment.order_id,
        paymentId: payment.id,
        transactionId: data.id,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    await saveLog('error', 'Erro ao processar webhook Pagar.me', { error: error.message })
    return NextResponse.json(
      { error: 'Erro ao processar webhook' },
      { status: 500 }
    )
  }
}
