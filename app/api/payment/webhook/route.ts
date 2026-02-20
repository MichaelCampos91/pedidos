import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { query } from '@/lib/database'
import { saveLog, preparePaymentLogDataSafely } from '@/lib/logger'
import { syncOrderToBling } from '@/lib/bling'

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
      amount?: number
      charge?: { id?: string; status?: string; amount?: number; last_transaction?: { status?: string } }
      charges?: Array<{ id?: string; amount?: number; last_transaction?: { amount?: number } }>
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

    // Capturar charge_id (ID da cobrança do Pagar.me)
    // Pode vir em: data.id (order ID), data.charges[0].id (charge ID), ou data.charge.id
    const chargeId = 
      (Array.isArray(data.charges) && data.charges[0]?.id) 
        ? String(data.charges[0].id)
        : (data.charge as { id?: string })?.id
          ? String((data.charge as { id: string }).id)
          : data.id
            ? String(data.id)
            : null

    // Verificar status do pagamento
    const charge = (data.charge ?? data) as WebhookData['charge'] & { id?: string }
    const status = charge?.status ?? (charge as { last_transaction?: { status?: string } })?.last_transaction?.status

    if (!status) {
      await saveLog('warning', 'Webhook Pagar.me sem status', { body })
      return NextResponse.json({ error: 'Status não encontrado' }, { status: 400 })
    }

    // Buscar pagamento no banco usando transaction_id ou order_id
    const transactionId = data.id || charge.id || chargeId
    const paymentResult = await query(
      'SELECT * FROM payments WHERE pagarme_transaction_id = $1 OR order_id = $2 ORDER BY created_at DESC LIMIT 1',
      [transactionId, orderId]
    )

    if (paymentResult.rows.length === 0) {
      await saveLog('warning', 'Pagamento não encontrado no webhook', { orderId, transactionId, chargeId })
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

    // Valor cobrado: Pagar.me envia em centavos
    // Buscar em múltiplos locais possíveis na resposta do webhook
    let amountReais: number | null = null
    let rawAmount: number | null = null

    // Tentar buscar em data.charges[0].last_transaction.amount (mais confiável)
    if (Array.isArray(data.charges) && data.charges[0]?.last_transaction) {
      const lastTransaction = data.charges[0].last_transaction as { amount?: number }
      if (typeof lastTransaction.amount === 'number') {
        rawAmount = lastTransaction.amount
      }
    }

    // Fallback: buscar em data.charges[0].amount
    if (rawAmount == null && Array.isArray(data.charges) && data.charges[0]) {
      if (typeof data.charges[0].amount === 'number') {
        rawAmount = data.charges[0].amount
      }
    }

    // Fallback: buscar em data.charge.amount
    if (rawAmount == null && data.charge) {
      const chargeData = data.charge as { amount?: number }
      if (typeof chargeData.amount === 'number') {
        rawAmount = chargeData.amount
      }
    }

    // Fallback: buscar em data.amount (order amount)
    if (rawAmount == null && typeof data.amount === 'number') {
      rawAmount = data.amount
    }

    // Converter centavos para reais
    if (rawAmount != null && rawAmount >= 0) {
      amountReais = Math.round(rawAmount) / 100
    }

    if (amountReais != null) {
      await query(
        `UPDATE payments SET status = $1, paid_at = $2, amount = $3 WHERE id = $4`,
        [
          paymentStatus,
          paymentStatus === 'paid' ? new Date() : null,
          amountReais.toFixed(2),
          payment.id,
        ]
      )
    } else {
      await query(
        `UPDATE payments SET status = $1, paid_at = $2 WHERE id = $3`,
        [
          paymentStatus,
          paymentStatus === 'paid' ? new Date() : null,
          payment.id,
        ]
      )
    }

    // Se pagamento foi confirmado, atualizar pedido
    if (paymentStatus === 'paid' && payment.status !== 'paid') {
      await query(
        `UPDATE orders 
         SET status = $1, paid_at = CURRENT_TIMESTAMP 
         WHERE id = $2 AND status = 'aguardando_pagamento'`,
        ['aguardando_producao', payment.order_id]
      )

      // Preparar dados completos do log de forma segura
      const logData = await preparePaymentLogDataSafely(async () => {
        // Buscar dados completos do pedido e cliente
        const orderResult = await query(
          `SELECT o.*, c.name as client_name, c.email as client_email, c.cpf as client_cpf
           FROM orders o
           JOIN clients c ON o.client_id = c.id
           WHERE o.id = $1`,
          [payment.order_id]
        )
        const order = orderResult.rows[0] || null

        // Buscar endereço de entrega se disponível
        let shippingAddress = null
        if (order?.shipping_address_id) {
          try {
            const addressResult = await query(
              'SELECT * FROM client_addresses WHERE id = $1',
              [order.shipping_address_id]
            )
            shippingAddress = addressResult.rows[0] || null
          } catch (error) {
            // Ignorar erro, shippingAddress permanece null
          }
        }

        // Extrair dados do cartão se disponível no webhook
        let cardData: any = null
        try {
          const lastTransaction = (Array.isArray(data.charges) && data.charges[0]?.last_transaction) ||
                                 (data.charge as any)?.last_transaction
          if (lastTransaction?.card) {
            const card = lastTransaction.card
            cardData = {
              last_four_digits: card.last_four_digits || null,
              holder_name: card.holder_name || null,
              expiration_date: card.expiration_date || null,
              brand: card.brand || null,
            }
          }
        } catch (error) {
          // Ignorar erro, cardData permanece null
        }

        // Extrair motivo de recusa/erro se disponível
        let refusalReason: string | null = null
        try {
          const lastTransaction = (Array.isArray(data.charges) && data.charges[0]?.last_transaction) ||
                                 (data.charge as any)?.last_transaction
          if (lastTransaction) {
            refusalReason = lastTransaction.acquirer_response_message || 
                           lastTransaction.refusal_reason ||
                           (lastTransaction.gateway_response?.errors?.[0]?.message) ||
                           null
          }
        } catch (error) {
          // Ignorar erro, refusalReason permanece null
        }

        // Preparar dados do cliente
        const customerLogData = order ? {
          name: order.client_name || null,
          email: order.client_email || null,
          document: order.client_cpf || null,
          address: shippingAddress ? {
            street: shippingAddress.street || null,
            number: shippingAddress.number || null,
            complement: shippingAddress.complement || null,
            neighborhood: shippingAddress.neighborhood || null,
            city: shippingAddress.city || null,
            state: shippingAddress.state || null,
            zip_code: shippingAddress.zip_code || shippingAddress.cep || null,
          } : null,
        } : null

        // Buscar dados atualizados do pagamento
        const updatedPaymentResult = await query(
          'SELECT * FROM payments WHERE id = $1',
          [payment.id]
        )
        const updatedPayment = updatedPaymentResult.rows[0] || payment

        return {
          order_id: payment.order_id,
          payment_id: payment.id,
          transaction_id: transactionId,
          charge_id: chargeId,
          status: paymentStatus,
          refusal_reason: refusalReason,
          customer: customerLogData,
          payment: {
            method: updatedPayment.method || null,
            amount: updatedPayment.amount || null,
            amount_charged: amountReais != null ? amountReais.toFixed(2) : (updatedPayment.amount || null),
            amount_source: amountReais != null ? 'pagarme' : 'calculated',
            installments: updatedPayment.installments || 1,
            card: cardData,
            billing_address: null, // Endereço de cobrança não está disponível no webhook
          },
          timestamps: {
            created_at: updatedPayment.created_at ? new Date(updatedPayment.created_at).toISOString() : null,
            paid_at: updatedPayment.paid_at ? new Date(updatedPayment.paid_at).toISOString() : null,
          },
        }
      })

      // Log de pagamento confirmado (com tratamento de erro para não afetar fluxo)
      try {
        await saveLog('info', 'Pagamento confirmado via webhook', logData, 'payment')
      } catch (error) {
        // Se até mesmo saveLog falhar, apenas logar no console
        console.error('[Payment Webhook] Erro ao salvar log (não crítico):', error)
        // Continuar fluxo normalmente
      }

      try {
        await syncOrderToBling(Number(payment.order_id))
      } catch (_e) {
        // Falha no Bling não quebra o webhook; status fica pendente para reenvio manual
      }
    } else if (paymentStatus === 'failed' || paymentStatus === 'refused') {
      // Também logar quando pagamento for recusado/falhou
      const logData = await preparePaymentLogDataSafely(async () => {
        // Extrair motivo de recusa/erro
        let refusalReason: string | null = null
        try {
          const lastTransaction = (Array.isArray(data.charges) && data.charges[0]?.last_transaction) ||
                                 (data.charge as any)?.last_transaction
          if (lastTransaction) {
            refusalReason = lastTransaction.acquirer_response_message || 
                           lastTransaction.refusal_reason ||
                           (lastTransaction.gateway_response?.errors?.[0]?.message) ||
                           null
          }
        } catch (error) {
          // Ignorar erro
        }

        return {
          order_id: payment.order_id,
          payment_id: payment.id,
          transaction_id: transactionId,
          charge_id: chargeId,
          status: paymentStatus,
          refusal_reason: refusalReason || 'Motivo não disponível',
        }
      })

      try {
        await saveLog('warning', `Pagamento ${paymentStatus === 'failed' ? 'falhou' : 'recusado'} via webhook`, logData, 'payment')
      } catch (error) {
        console.error('[Payment Webhook] Erro ao salvar log de falha (não crítico):', error)
      }
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
