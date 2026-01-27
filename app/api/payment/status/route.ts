import { NextRequest, NextResponse } from 'next/server'
import { getTransaction } from '@/lib/pagarme'
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
    console.warn('[Payment Status] Erro ao buscar ambiente ativo, usando fallback:', error)
  }

  // Fallback: verificar qual token existe
  try {
    const productionToken = await getToken('pagarme', 'production')
    const sandboxToken = await getToken('pagarme', 'sandbox')
    
    if (productionToken) return 'production'
    if (sandboxToken) return 'sandbox'
  } catch (error) {
    console.warn('[Payment Status] Erro ao verificar tokens, usando detecção automática:', error)
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
    const environment = environmentParam || await detectEnvironment(request)

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
