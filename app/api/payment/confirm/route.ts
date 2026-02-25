import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getTransaction } from '@/lib/pagarme'
import { getActiveEnvironment } from '@/lib/settings'
import { getToken } from '@/lib/integrations'
import type { IntegrationEnvironment } from '@/lib/integrations-types'
import { saveLog, preparePaymentLogDataSafely } from '@/lib/logger'
import { syncOrderToBling } from '@/lib/bling'

// Detectar ambiente baseado em ambiente ativo ou fallback automático
async function detectEnvironment(request: NextRequest): Promise<'sandbox' | 'production'> {
  // Primeiro, tentar buscar ambiente ativo configurado
  try {
    const activeEnv = await getActiveEnvironment('pagarme')
    if (activeEnv) {
      return activeEnv
    }
  } catch (error) {
    console.warn('[Payment Confirm] Erro ao buscar ambiente ativo, usando fallback:', error)
  }

  // Fallback: verificar qual token existe
  try {
    const productionToken = await getToken('pagarme', 'production')
    const sandboxToken = await getToken('pagarme', 'sandbox')

    if (productionToken) return 'production'
    if (sandboxToken) return 'sandbox'
  } catch (error) {
    console.warn('[Payment Confirm] Erro ao verificar tokens, usando detecção automática:', error)
  }

  // Fallback final: detecção automática
  if (process.env.NODE_ENV === 'development') {
    return 'sandbox'
  }

  const hostname = request.headers.get('host') || ''
  if (
    hostname.includes('localhost') ||
    hostname.includes('127.0.0.1') ||
    hostname.includes('192.168.') ||
    hostname.includes('10.') ||
    hostname.includes('172.')
  ) {
    return 'sandbox'
  }

  if (process.env.PAGARME_ENVIRONMENT === 'sandbox') {
    return 'sandbox'
  }

  return 'production'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const transactionId = body?.transaction_id as string | undefined
    const orderIdFromBody = body?.order_id as number | undefined

    if (!transactionId || typeof transactionId !== 'string') {
      return NextResponse.json(
        { error: 'transaction_id é obrigatório' },
        { status: 400 }
      )
    }

    const environment = (await detectEnvironment(request)) as IntegrationEnvironment

    // Buscar pagamento existente pelo transaction_id (Pagar.me order id)
    let paymentResult = await query(
      'SELECT * FROM payments WHERE pagarme_transaction_id = $1 ORDER BY created_at DESC LIMIT 1',
      [transactionId]
    )

    // Fallback: se não encontrar e tiver order_id no body, buscar pelo order_id
    if (paymentResult.rows.length === 0 && orderIdFromBody) {
      paymentResult = await query(
        'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
        [orderIdFromBody]
      )
    }

    if (paymentResult.rows.length === 0) {
      await saveLog(
        'warning',
        'Confirmação ativa: pagamento não encontrado',
        { transaction_id: transactionId, order_id: orderIdFromBody || null },
        'payment'
      )
      return NextResponse.json(
        { error: 'Pagamento não encontrado' },
        { status: 404 }
      )
    }

    const payment = paymentResult.rows[0]
    const orderId = payment.order_id as number

    // Buscar transação atualizada no Pagar.me
    const transaction = await getTransaction(transactionId, environment)

    // Extrair status da transação
    let gatewayStatus = 'pending'
    if (transaction.charges && transaction.charges.length > 0) {
      const charge = transaction.charges[0] as any
      if (charge.last_transaction) {
        gatewayStatus = charge.last_transaction.status || charge.status || 'pending'
      } else {
        gatewayStatus = charge.status || 'pending'
      }
    } else if (transaction.status) {
      gatewayStatus = transaction.status
    }

    // Mapear para status interno
    let paymentStatus: 'pending' | 'paid' | 'failed' = 'pending'
    if (gatewayStatus === 'paid' || gatewayStatus === 'captured') {
      paymentStatus = 'paid'
    } else if (gatewayStatus === 'refused' || gatewayStatus === 'failed') {
      paymentStatus = 'failed'
    } else if (gatewayStatus === 'pending') {
      paymentStatus = 'pending'
    }

    // Valor cobrado: buscar em múltiplos locais possíveis
    let amountReais: number | null = null
    let rawAmount: number | null = null

    try {
      if (Array.isArray((transaction as any).charges) && (transaction as any).charges[0]?.last_transaction) {
        const lastTransaction = (transaction as any).charges[0].last_transaction as { amount?: number }
        if (typeof lastTransaction.amount === 'number') {
          rawAmount = lastTransaction.amount
        }
      }

      if (rawAmount == null && Array.isArray((transaction as any).charges) && (transaction as any).charges[0]) {
        if (typeof (transaction as any).charges[0].amount === 'number') {
          rawAmount = (transaction as any).charges[0].amount
        }
      }

      if (rawAmount == null && typeof (transaction as any).amount === 'number') {
        rawAmount = (transaction as any).amount
      }

      if (rawAmount != null && rawAmount >= 0) {
        amountReais = Math.round(rawAmount) / 100
      }
    } catch (e) {
      // Ignorar, amountReais fica null
    }

    // Atualizar pagamento no banco
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

    // Se o pagamento foi confirmado agora, atualizar pedido e logar
    if (paymentStatus === 'paid' && payment.status !== 'paid') {
      await query(
        `UPDATE orders 
         SET status = $1, paid_at = CURRENT_TIMESTAMP 
         WHERE id = $2 AND status = 'aguardando_pagamento'`,
        ['aguardando_producao', orderId]
      )

      const logData = await preparePaymentLogDataSafely(async () => {
        // Buscar dados completos do pedido e cliente
        const orderResult = await query(
          `SELECT o.*, c.name as client_name, c.email as client_email, c.cpf as client_cpf
           FROM orders o
           JOIN clients c ON o.client_id = c.id
           WHERE o.id = $1`,
          [orderId]
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
          } catch {
            // Ignorar erro, shippingAddress permanece null
          }
        }

        // Extrair dados do cartão, se houver (para pagamentos com cartão)
        let cardData: any = null
        try {
          const firstCharge = (transaction as any).charges?.[0]
          const lastTransaction = firstCharge?.last_transaction
          if (lastTransaction?.card) {
            const card = lastTransaction.card
            cardData = {
              last_four_digits: card.last_four_digits || null,
              holder_name: card.holder_name || null,
              expiration_date: card.expiration_date || null,
              brand: card.brand || null,
            }
          }
        } catch {
          // Ignorar erro, cardData permanece null
        }

        // Preparar dados do cliente
        const customerLogData = order
          ? {
              name: order.client_name || null,
              email: order.client_email || null,
              document: order.client_cpf || null,
              address: shippingAddress
                ? {
                    street: shippingAddress.street || null,
                    number: shippingAddress.number || null,
                    complement: shippingAddress.complement || null,
                    neighborhood: shippingAddress.neighborhood || null,
                    city: shippingAddress.city || null,
                    state: shippingAddress.state || null,
                    zip_code: shippingAddress.zip_code || shippingAddress.cep || null,
                  }
                : null,
            }
          : null

        // Buscar dados atualizados do pagamento
        const updatedPaymentResult = await query(
          'SELECT * FROM payments WHERE id = $1',
          [payment.id]
        )
        const updatedPayment = updatedPaymentResult.rows[0] || payment

        return {
          order_id: orderId,
          payment_id: payment.id,
          transaction_id: transactionId,
          charge_id: (transaction as any).charges?.[0]?.id || null,
          status: paymentStatus,
          refusal_reason: null,
          customer: customerLogData,
          payment: {
            method: updatedPayment.method || null,
            amount: updatedPayment.amount || null,
            amount_charged:
              amountReais != null ? amountReais.toFixed(2) : updatedPayment.amount || null,
            amount_source: amountReais != null ? 'pagarme' : 'calculated',
            installments: updatedPayment.installments || 1,
            card: cardData,
            billing_address: null,
          },
          timestamps: {
            created_at: updatedPayment.created_at
              ? new Date(updatedPayment.created_at).toISOString()
              : null,
            paid_at: updatedPayment.paid_at
              ? new Date(updatedPayment.paid_at).toISOString()
              : null,
          },
        }
      })

      try {
        await saveLog('info', 'Pagamento confirmado via confirmação ativa', logData, 'payment')
      } catch (error) {
        console.error('[Payment Confirm] Erro ao salvar log (não crítico):', error)
      }

      try {
        await syncOrderToBling(orderId)
      } catch {
        // Falha no Bling não quebra a confirmação; pedido fica para reenvio manual
      }
    } else if (paymentStatus === 'failed' && payment.status !== 'failed') {
      // Logar falhas confirmadas via pooling
      const logData = await preparePaymentLogDataSafely(async () => {
        return {
          order_id: orderId,
          payment_id: payment.id,
          transaction_id: transactionId,
          status: paymentStatus,
        }
      })

      try {
        await saveLog(
          'warning',
          'Pagamento marcado como falhado via confirmação ativa',
          logData,
          'payment'
        )
      } catch (error) {
        console.error('[Payment Confirm] Erro ao salvar log de falha (não crítico):', error)
      }
    }

    return NextResponse.json({
      success: true,
      status: paymentStatus,
    })
  } catch (error: any) {
    await saveLog(
      'error',
      'Erro ao confirmar pagamento via confirmação ativa',
      {
        error_message: error.message || 'Erro desconhecido',
      },
      'payment'
    )
    if (process.env.NODE_ENV === 'development') {
      console.error('[Payment Confirm] Erro ao confirmar pagamento:', error)
    }
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erro ao confirmar pagamento',
      },
      { status: 500 }
    )
  }
}

