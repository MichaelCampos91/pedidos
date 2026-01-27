import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { createPixTransaction, createCreditCardTransaction } from '@/lib/pagarme'
import type { IntegrationEnvironment } from '@/lib/integrations-types'

// Detectar ambiente baseado em NODE_ENV ou hostname
function detectEnvironment(request: NextRequest): 'sandbox' | 'production' {
  // Verificar variável de ambiente primeiro
  if (process.env.NODE_ENV === 'development') {
    return 'sandbox'
  }
  
  // Verificar hostname da requisição
  const hostname = request.headers.get('host') || ''
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes('192.168.') || hostname.includes('10.') || hostname.includes('172.')) {
    return 'sandbox'
  }
  
  // Verificar variável de ambiente específica
  if (process.env.PAGARME_ENVIRONMENT === 'sandbox') {
    return 'sandbox'
  }
  
  return 'production'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { order_id, payment_method, customer, billing, credit_card, environment } = body
    
    // Log do customer recebido no body
    console.log('[Payment API] Customer recebido no body:', {
      orderId: order_id,
      paymentMethod: payment_method,
      customer: {
        name: customer?.name || 'N/A',
        email: customer?.email || 'N/A',
        hasDocument: !!customer?.document,
        documentPreview: customer?.document ? `${customer.document.substring(0, 3)}***` : 'N/A',
        phone: customer?.phone || 'N/A',
        hasPhone: !!customer?.phone,
        phoneLength: customer?.phone?.length || 0,
      },
    })
    
    // Log do credit_card recebido no body
    if (payment_method === 'credit_card') {
      console.log('[Payment API] Credit card recebido no body:', {
        hasCreditCard: !!credit_card,
        installments: credit_card?.installments,
        installmentsType: typeof credit_card?.installments,
        cardToken: credit_card?.card_token ? 'presente' : 'ausente',
        cardId: credit_card?.card_id ? 'presente' : 'ausente',
        creditCardKeys: credit_card ? Object.keys(credit_card) : [],
      })
    }
    
    // Detectar ambiente se não foi fornecido ou usar o fornecido
    const detectedEnvironment = environment || detectEnvironment(request)

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

    // Buscar itens do pedido
    const itemsResult = await query(
      'SELECT id, product_id, title, price, quantity FROM order_items WHERE order_id = $1',
      [order_id]
    )

    const orderItems = itemsResult.rows

    console.log('[Payment API] Itens do pedido encontrados:', {
      itemsCount: orderItems.length,
      items: orderItems.map(item => ({
        id: item.id,
        productId: item.product_id,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
      })),
    })

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
    const cleanCPF = (customer.document || order.client_cpf || '').replace(/\D/g, '')
    if (!cleanCPF || cleanCPF.length !== 11) {
      return NextResponse.json(
        { error: 'CPF do cliente é obrigatório e deve ser válido' },
        { status: 400 }
      )
    }

    // Log antes de processar telefone
    console.log('[Payment API] Telefones disponíveis:', {
      customerPhone: customer.phone,
      clientWhatsapp: order.client_whatsapp,
      clientPhone: order.client_phone,
    })

    // Limpar telefone removendo caracteres não numéricos
    let cleanPhone = (customer.phone || order.client_whatsapp || order.client_phone || '').replace(/\D/g, '')
    
    // Remover código do país (55) se presente no início
    if (cleanPhone.startsWith('55') && cleanPhone.length > 11) {
      cleanPhone = cleanPhone.substring(2)
      console.log('[Payment API] Código do país (55) removido do telefone')
    }
    
    console.log('[Payment API] Telefone limpo:', {
      original: customer.phone || order.client_whatsapp || order.client_phone,
      cleaned: cleanPhone,
      length: cleanPhone.length,
    })

    // Validação mais robusta - telefone brasileiro deve ter pelo menos 10 dígitos (DDD + número)
    // Formato esperado: 2 dígitos DDD + 8 ou 9 dígitos do número
    if (!cleanPhone || cleanPhone.length < 10) {
      console.error('[Payment API] Telefone inválido ou ausente:', {
        cleanPhone,
        length: cleanPhone.length,
        sources: {
          customerPhone: customer.phone,
          clientWhatsapp: order.client_whatsapp,
          clientPhone: order.client_phone,
        },
      })
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
      console.error('[Payment API] DDD inválido:', {
        areaCode,
        areaCodeNum,
        cleanPhone,
      })
      return NextResponse.json(
        { error: 'DDD do telefone inválido' },
        { status: 400 }
      )
    }

    // Validar número (deve ter 8 ou 9 dígitos)
    if (number.length < 8 || number.length > 9) {
      console.error('[Payment API] Número de telefone inválido após extração:', {
        areaCode,
        number,
        numberLength: number.length,
        cleanPhone,
        expectedLength: '8 ou 9 dígitos',
      })
      return NextResponse.json(
        { error: 'Número de telefone inválido. Deve ter 8 ou 9 dígitos após o DDD.' },
        { status: 400 }
      )
    }

    // Log do telefone formatado
    console.log('[Payment API] Telefone formatado para Pagar.me:', {
      country_code: '55',
      area_code: areaCode,
      number: number,
      fullPhone: `+55${areaCode}${number}`,
      formatValid: true,
    })

    const customerData = {
      name: (customer.name || order.client_name || '').trim(),
      email: (customer.email || order.client_email || '').trim(),
      document: cleanCPF,
      type: 'individual', // CPF sempre é individual
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

    // Log do customerData completo antes de chamar pagarme.ts
    console.log('[Payment API] CustomerData completo antes de enviar ao Pagar.me:', {
      name: customerData.name,
      email: customerData.email,
      hasDocument: !!customerData.document,
      documentPreview: customerData.document ? `${customerData.document.substring(0, 3)}***` : 'N/A',
      type: customerData.type,
      phone: {
        country_code: customerData.phone.country_code,
        area_code: customerData.phone.area_code,
        number: customerData.phone.number,
        fullPhone: `+${customerData.phone.country_code}${customerData.phone.area_code}${customerData.phone.number}`,
      },
      hasPhone: !!customerData.phone,
      phoneValid: !!(customerData.phone?.country_code && customerData.phone?.area_code && customerData.phone?.number),
    })

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
            country: 'BR',
          },
        }
      }
    }

    // Criar transação
    const amount = Math.round(parseFloat(order.total) * 100) // Converter para centavos

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Valor do pedido deve ser maior que zero' },
        { status: 400 }
      )
    }

    console.log('[Payment API] Criando transação', {
      payment_method,
      environment: detectedEnvironment,
      environmentSource: environment ? 'request' : 'detected',
      amount,
      amountInReais: (amount / 100).toFixed(2),
      order_id,
      hasCustomer: !!customerData,
      customerName: customerData.name,
      customerEmail: customerData.email,
      hasBilling: !!billingData,
      billingAddress: billingData?.address ? `${billingData.address.street}, ${billingData.address.number}` : 'N/A',
      nodeEnv: process.env.NODE_ENV,
      hostname: request.headers.get('host'),
    })

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

    console.log('[Payment API] Transação criada com sucesso', {
      transactionId: transaction.id,
      status: transaction.status,
      payment_method,
      hasPixQrCode: !!transaction.pix_qr_code,
      pixQrCodeLength: transaction.pix_qr_code?.length || 0,
    })

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
    console.error('[Payment API] Erro ao criar pagamento:', {
      error: error.message,
      stack: error.stack,
      name: error.name,
    })
    return NextResponse.json(
      { 
        error: error.message || 'Erro ao processar pagamento',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
