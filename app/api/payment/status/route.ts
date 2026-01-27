import { NextRequest, NextResponse } from 'next/server'
import { getTransaction } from '@/lib/pagarme'
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const transactionId = searchParams.get('transaction_id')
    const environmentParam = searchParams.get('environment') as 'sandbox' | 'production' | null
    
    if (!transactionId) {
      return NextResponse.json(
        { error: 'transaction_id é obrigatório' },
        { status: 400 }
      )
    }

    // Detectar ambiente se não foi fornecido
    const environment = environmentParam || detectEnvironment(request)

    // Buscar transação no Pagar.me
    const transaction = await getTransaction(transactionId, environment as IntegrationEnvironment)

    // Extrair status da transação PIX
    let status = 'pending'
    if (transaction.charges && transaction.charges.length > 0) {
      const charge = transaction.charges[0]
      if (charge.last_transaction) {
        status = charge.last_transaction.status || charge.status || 'pending'
      } else {
        status = charge.status || 'pending'
      }
    } else if (transaction.status) {
      status = transaction.status
    }

    return NextResponse.json({
      success: true,
      transaction_id: transactionId,
      status,
      transaction: {
        id: transaction.id,
        status,
        payment_method: transaction.payment_method || 'pix',
        pix_qr_code: transaction.pix_qr_code,
        pix_expiration_date: transaction.pix_expiration_date,
      },
    })
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Payment Status API] Erro ao verificar status:', error.message)
    }
    return NextResponse.json(
      { 
        error: error.message || 'Erro ao verificar status da transação',
        success: false,
      },
      { status: 500 }
    )
  }
}
