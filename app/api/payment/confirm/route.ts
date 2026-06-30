import { NextRequest, NextResponse } from 'next/server'
import { getActiveEnvironment } from '@/lib/settings'
import { getToken } from '@/lib/integrations'
import type { IntegrationEnvironment } from '@/lib/integrations-types'
import { saveLog } from '@/lib/logger'
import { reconcilePaymentByTransaction } from '@/lib/payment-confirmation'

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
    const environmentFromBody = body?.environment as IntegrationEnvironment | undefined

    if (!transactionId || typeof transactionId !== 'string') {
      return NextResponse.json(
        { error: 'transaction_id é obrigatório' },
        { status: 400 }
      )
    }

    // Usar o ambiente informado pelo cliente quando válido (evita divergência com a criação),
    // caso contrário detectar pelo ambiente ativo/fallback.
    const environment: IntegrationEnvironment =
      environmentFromBody === 'sandbox' || environmentFromBody === 'production'
        ? environmentFromBody
        : await detectEnvironment(request)

    const result = await reconcilePaymentByTransaction(transactionId, environment, {
      orderIdFallback: orderIdFromBody,
    })

    if (!result.found) {
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

    return NextResponse.json({
      success: true,
      status: result.status,
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
