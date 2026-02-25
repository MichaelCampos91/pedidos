import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { recalculateOrderTotal, calculatePixDiscount } from '@/lib/payment-rules'
import { getActiveEnvironment } from '@/lib/settings'
import { getToken } from '@/lib/integrations'
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
    console.warn('[Payment Preview] Erro ao buscar ambiente ativo, usando fallback:', error)
  }

  // Fallback: verificar qual token existe
  try {
    const productionToken = await getToken('pagarme', 'production')
    const sandboxToken = await getToken('pagarme', 'sandbox')

    if (productionToken) return 'production'
    if (sandboxToken) return 'sandbox'
  } catch (error) {
    console.warn('[Payment Preview] Erro ao verificar tokens, usando detecção automática:', error)
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const orderIdParam = searchParams.get('order_id')

    if (!orderIdParam) {
      return NextResponse.json(
        { error: 'order_id é obrigatório' },
        { status: 400 }
      )
    }

    const orderId = parseInt(orderIdParam, 10)
    if (isNaN(orderId)) {
      return NextResponse.json(
        { error: 'order_id inválido' },
        { status: 400 }
      )
    }

    const environment = (await detectEnvironment(request)) as IntegrationEnvironment

    // Buscar pedido
    const orderResult = await query(
      `SELECT o.*, c.name as client_name, c.email as client_email, c.cpf as client_cpf
       FROM orders o
       JOIN clients c ON o.client_id = c.id
       WHERE o.id = $1`,
      [orderId]
    )

    if (orderResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Pedido não encontrado' },
        { status: 404 }
      )
    }

    const order = orderResult.rows[0]

    // Itens do pedido
    const itemsResult = await query(
      'SELECT id, product_id, title, price, quantity FROM order_items WHERE order_id = $1',
      [orderId]
    )
    const orderItems = itemsResult.rows as Array<{ price: string | number; quantity: number }>

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

    // Calcular desconto PIX apenas sobre itens (mesma regra do /payment/create)
    const discountResult = await calculatePixDiscount(itemsTotal)
    const pixFinalTotal = discountResult.finalValue + totalShipping

    return NextResponse.json({
      success: true,
      environment,
      order_id: orderId,
      totals: {
        items_total: itemsTotal,
        shipping_total: totalShipping,
        backend_total: backendTotal,
      },
      pix: {
        has_discount: discountResult.discount > 0,
        discount: discountResult.discount,
        discount_type: discountResult.discountType,
        final_total: pixFinalTotal,
      },
    })
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Payment Preview] Erro ao gerar preview:', error)
    }
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erro ao gerar pré-visualização de pagamento',
      },
      { status: 500 }
    )
  }
}

