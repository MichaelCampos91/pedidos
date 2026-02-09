import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { createPixTransaction, createCreditCardTransaction } from '@/lib/pagarme'
import { getActiveEnvironment } from '@/lib/settings'
import { getToken } from '@/lib/integrations'
import { calculatePixDiscount, calculateInstallmentTotal, getInstallmentRate, recalculateOrderTotal } from '@/lib/payment-rules'
import { saveLog } from '@/lib/logger'
import { syncOrderToBling } from '@/lib/bling'
import type { IntegrationEnvironment } from '@/lib/integrations-types'

// Detectar ambiente baseado em ambiente ativo ou fallback automático
async function detectEnvironment(request: NextRequest): Promise<'sandbox' | 'production'> {
  // Primeiro, tentar buscar ambiente ativo configurado
  try {
    const activeEnv = await getActiveEnvironment('pagarme')
    if (activeEnv) {
      return activeEnv
    }
  } catch (error) {
    console.warn('[Payment Create] Erro ao buscar ambiente ativo, usando fallback:', error)
  }

  // Fallback: verificar qual token existe
  try {
    const productionToken = await getToken('pagarme', 'production')
    const sandboxToken = await getToken('pagarme', 'sandbox')
    
    if (productionToken) return 'production'
    if (sandboxToken) return 'sandbox'
  } catch (error) {
    console.warn('[Payment Create] Erro ao verificar tokens, usando detecção automática:', error)
  }

  // Fallback final: detecção automática
  if (process.env.NODE_ENV === 'development') {
    return 'sandbox'
  }
  
  const hostname = request.headers.get('host') || ''
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes('192.168.') || hostname.includes('10.') || hostname.includes('172.')) {
    return 'sandbox'
  }
  
  if (process.env.PAGARME_ENVIRONMENT === 'sandbox') {
    return 'sandbox'
  }
  
  return 'production'
}

export async function POST(request: NextRequest) {
  let order_id: number | undefined
  let payment_method: string | undefined
  
  try {
    const body = await request.json()
    const parsedBody = body as { order_id?: number; payment_method?: string; customer?: any; billing?: any; credit_card?: any; environment?: string }
    order_id = parsedBody.order_id
    payment_method = parsedBody.payment_method
    const { customer, billing, credit_card, environment } = parsedBody
    
    // Detectar ambiente se não foi fornecido ou usar o fornecido
    const detectedEnvironment = environment || await detectEnvironment(request)

    if (!order_id || !payment_method || !customer) {
      return NextResponse.json(
        { error: 'Dados obrigatórios: order_id, payment_method, customer' },
        { status: 400 }
      )
    }

    // Log de tentativa de pagamento iniciada
    await saveLog(
      'info',
      `Tentativa de pagamento iniciada para pedido #${order_id}`,
      {
        order_id,
        payment_method,
        environment: detectedEnvironment,
      },
      'payment'
    )

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

    // Proteger contra múltiplas tentativas: verificar se já existe pagamento pendente ou aprovado
    const existingPaymentResult = await query(
      `SELECT id, status FROM payments WHERE order_id = $1 AND status IN ('pending', 'paid') LIMIT 1`,
      [order_id]
    )
    if (existingPaymentResult.rows.length > 0) {
      await saveLog(
        'warning',
        `Tentativa de pagamento duplicada para pedido #${order_id}`,
        {
          order_id,
          payment_method,
          existing_payment_status: existingPaymentResult.rows[0].status,
        },
        'payment'
      )
      return NextResponse.json(
        { error: 'Já existe um pagamento em processamento ou aprovado para este pedido.' },
        { status: 400 }
      )
    }

    // Buscar itens do pedido
    const itemsResult = await query(
      'SELECT id, product_id, title, price, quantity FROM order_items WHERE order_id = $1',
      [order_id]
    )

    const orderItems = itemsResult.rows

    // Buscar endereço de entrega
    let shippingAddress = null
    if (order.shipping_address_id) {
      const addressResult = await query(
        'SELECT * FROM client_addresses WHERE id = $1',
        [order.shipping_address_id]
      )
      shippingAddress = addressResult.rows[0] || null
    }

    // Preparar dados do cliente e validar CPF (pode ser diferente do cliente do pedido se usar cartão de terceiro)
    const cleanCPF = (customer.document || order.client_cpf || '').replace(/\D/g, '')
    if (!cleanCPF || cleanCPF.length !== 11) {
      return NextResponse.json(
        { error: 'CPF do cliente é obrigatório e deve ser válido' },
        { status: 400 }
      )
    }

    // Limpar telefone removendo caracteres não numéricos
    let cleanPhone = (customer.phone || order.client_whatsapp || order.client_phone || '').replace(/\D/g, '')
    
    // Remover código do país (55) se presente no início
    if (cleanPhone.startsWith('55') && cleanPhone.length > 11) {
      cleanPhone = cleanPhone.substring(2)
    }

    // Validação mais robusta - telefone brasileiro deve ter pelo menos 10 dígitos (DDD + número)
    // Formato esperado: 2 dígitos DDD + 8 ou 9 dígitos do número
    if (!cleanPhone || cleanPhone.length < 10) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Payment API] Telefone inválido ou ausente')
      }
      return NextResponse.json(
        { error: 'Telefone do cliente é obrigatório e deve ser válido. Por favor, verifique os dados do cliente.' },
        { status: 400 }
      )
    }

    // Extrair DDD e número (formato brasileiro: 2 dígitos DDD + 8 ou 9 dígitos)
    // DDD sempre são os 2 primeiros dígitos
    const areaCode = cleanPhone.substring(0, 2)
    // Número são os dígitos restantes
    const number = cleanPhone.substring(2)

    // Validar DDD (deve ser entre 11 e 99)
    const areaCodeNum = parseInt(areaCode)
    if (isNaN(areaCodeNum) || areaCodeNum < 11 || areaCodeNum > 99) {
      return NextResponse.json(
        { error: 'DDD do telefone inválido' },
        { status: 400 }
      )
    }

    // Validar número (deve ter 8 ou 9 dígitos)
    if (number.length < 8 || number.length > 9) {
      return NextResponse.json(
        { error: 'Número de telefone inválido. Deve ter 8 ou 9 dígitos após o DDD.' },
        { status: 400 }
      )
    }

    const customerData = {
      name: (customer.name || order.client_name || '').trim(),
      email: (customer.email || order.client_email || '').trim(),
      document: cleanCPF,
      type: 'individual' as const, // CPF sempre é individual
      phone: {
        country_code: '55',
        area_code: areaCode,
        number: number,
      },
    }

    // Validar campos obrigatórios do customer
    if (!customerData.name || customerData.name.length < 3) {
      return NextResponse.json(
        { error: 'Nome do cliente é obrigatório' },
        { status: 400 }
      )
    }

    if (!customerData.email || !customerData.email.includes('@')) {
      return NextResponse.json(
        { error: 'Email do cliente é obrigatório e deve ser válido' },
        { status: 400 }
      )
    }


    // Preparar dados de cobrança (opcional para PIX, mas recomendado)
    let billingData = undefined
    if (billing?.address || shippingAddress) {
      const address = billing?.address || shippingAddress
      if (address && address.street && address.city && address.state) {
        billingData = {
          name: customer.name || order.client_name,
          address: {
            street: (address.street || '').substring(0, 126),
            number: address.number || 'S/N',
            complement: address.complement || '',
            neighborhood: address.neighborhood || '',
            city: address.city || '',
            state: (address.state || '').toUpperCase().substring(0, 2),
            zip_code: (address.zip_code || address.cep || '').replace(/\D/g, '').substring(0, 8),
          },
        }
      }
    }

    // Valor do frete vem somente de order.total_shipping (escolha do vendedor ao criar/editar o pedido).
    // Não recalcular com regras de frete grátis: cobrança deve refletir a modalidade selecionada.
    const totalShipping = parseFloat(order.total_shipping || '0')
    const backendTotal = recalculateOrderTotal(orderItems, totalShipping)
    const itemsTotal = orderItems.reduce(
      (sum, item) => sum + parseFloat(String(item.price)) * (item.quantity || 1),
      0
    )

    if (backendTotal <= 0) {
      return NextResponse.json(
        { error: 'Valor do pedido deve ser maior que zero' },
        { status: 400 }
      )
    }

    // Valor base para cobrança (será ajustado por PIX ou parcelamento)
    let chargeBaseValue = backendTotal
    let amount: number

    // Aplicar desconto PIX apenas sobre o valor dos itens (frete não recebe desconto)
    let pixDiscountApplied = 0
    if (payment_method === 'pix') {
      try {
        const discountResult = await calculatePixDiscount(itemsTotal)
        if (discountResult.discount > 0) {
          pixDiscountApplied = Math.round(discountResult.discount * 100) // centavos
          chargeBaseValue = discountResult.finalValue + totalShipping
        }
        amount = Math.round(chargeBaseValue * 100)
        if (process.env.NODE_ENV === 'development' && discountResult.discount > 0) {
          console.log('[Payment Create] Desconto PIX aplicado (apenas itens):', {
            itemsTotal,
            totalShipping,
            discount: discountResult.discount,
            final: chargeBaseValue,
          })
        }
      } catch (error) {
        console.error('[Payment Create] Erro ao calcular desconto PIX:', error)
        amount = Math.round(backendTotal * 100)
      }
    } else if (payment_method === 'credit_card') {
      // Recalcular valor com juros de parcelamento no backend
      const installments = Math.max(1, parseInt(String(credit_card?.installments || 1), 10))
      const rateFromDb = installments > 1 ? await getInstallmentRate(installments, detectedEnvironment as IntegrationEnvironment) : { rate_percentage: 0 }
      const installmentResult = await calculateInstallmentTotal(
        backendTotal,
        installments,
        detectedEnvironment as IntegrationEnvironment
      )
      chargeBaseValue = installmentResult.totalWithInterest
      amount = Math.round(chargeBaseValue * 100)
      if (process.env.NODE_ENV === 'development' && installments > 1 && !rateFromDb) {
        console.log('[Payment Create] Taxa de fallback usada para parcelamento:', { order_id, installments, totalWithInterest: installmentResult.totalWithInterest })
      }
    } else {
      amount = Math.round(backendTotal * 100)
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Valor do pedido deve ser maior que zero' },
        { status: 400 }
      )
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[Payment Create] Cobrança:', { order_id, total_shipping: totalShipping, charge_total: (amount / 100).toFixed(2) })
    }

    let transaction
    if (payment_method === 'pix') {
      transaction = await createPixTransaction({
        amount,
        payment_method: 'pix',
        customer: customerData,
        billing: billingData,
        items: orderItems,
        metadata: {
          order_id: order_id.toString(),
          pix_discount_applied: pixDiscountApplied > 0 ? pixDiscountApplied.toString() : undefined,
        },
      }, detectedEnvironment as IntegrationEnvironment)
    } else if (payment_method === 'credit_card') {
      // Validar se card_token ou card_id está presente
      if (!credit_card?.card_token && !credit_card?.card_id) {
        return NextResponse.json(
          { error: 'Para pagamento com cartão, é necessário tokenizar os dados do cartão. A tokenização deve ser feita no frontend usando a biblioteca Pagar.me JS antes de enviar a requisição.' },
          { status: 400 }
        )
      }
      
      transaction = await createCreditCardTransaction({
        amount,
        payment_method: 'credit_card',
        customer: customerData,
        billing: billingData,
        credit_card: {
          ...credit_card,
          installments: credit_card?.installments || 1,
        },
        items: orderItems,
        metadata: {
          order_id: order_id.toString(),
        },
      }, detectedEnvironment as IntegrationEnvironment)
    } else {
      return NextResponse.json(
        { error: 'Método de pagamento inválido' },
        { status: 400 }
      )
    }

    // Valor final cobrado (já recalculado no backend: PIX com desconto ou cartão com juros)
    const finalAmount = (amount / 100).toFixed(2)

    // Salvar pagamento no banco
    await query(
      `INSERT INTO payments (order_id, pagarme_transaction_id, method, installments, amount, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        order_id,
        transaction.id,
        payment_method,
        credit_card?.installments || 1,
        finalAmount,
        transaction.status === 'paid' ? 'paid' : 'pending',
      ]
    )

    // Log de pagamento criado com sucesso
    await saveLog(
      'info',
      `Pagamento criado com sucesso para pedido #${order_id}`,
      {
        order_id,
        transaction_id: transaction.id,
        payment_method,
        amount: finalAmount,
        status: transaction.status,
        installments: credit_card?.installments || 1,
        environment: detectedEnvironment,
      },
      'payment'
    )

    // Se pagamento foi aprovado imediatamente, atualizar pedido
    if (transaction.status === 'paid') {
      await query(
        'UPDATE orders SET status = $1, paid_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['aguardando_producao', order_id]
      )
      try {
        await syncOrderToBling(order_id)
      } catch (_e) {
        // Falha no Bling não quebra o fluxo de pagamento; status fica pendente para reenvio manual
      }
    }

    // Validar resposta antes de retornar ao frontend
    if (payment_method === 'pix') {
      // Para PIX, verificar se pix_qr_code está presente
      if (!transaction.pix_qr_code) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[Payment API] QR Code PIX não encontrado na transação:', {
            transactionId: transaction.id,
            transactionStatus: transaction.status,
            transactionKeys: Object.keys(transaction),
          })
        }
        return NextResponse.json(
          { 
            error: 'QR Code PIX não foi gerado. Verifique a configuração do Pagar.me e se o método PIX está habilitado na sua conta.',
            details: process.env.NODE_ENV === 'development' ? 'Transaction ID: ' + transaction.id : undefined,
          },
          { status: 500 }
        )
      }
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
    // Log de erro no pagamento
    await saveLog(
      'error',
      `Falha ao processar pagamento para pedido #${order_id || 'desconhecido'}`,
      {
        order_id: order_id || null,
        payment_method: payment_method || null,
        error_message: error.message || 'Erro desconhecido',
        error_stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      'payment'
    )

    if (process.env.NODE_ENV === 'development') {
      console.error('[Payment API] Erro ao criar pagamento:', error.message)
    }
    return NextResponse.json(
      { 
        error: error.message || 'Erro ao processar pagamento',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
