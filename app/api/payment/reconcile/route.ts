import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getActiveEnvironment } from '@/lib/settings'
import { getToken } from '@/lib/integrations'
import type { IntegrationEnvironment } from '@/lib/integrations-types'
import { saveLog } from '@/lib/logger'
import { reconcilePaymentByTransaction } from '@/lib/payment-confirmation'

export const dynamic = 'force-dynamic'

/**
 * Reconciliação de pagamentos PIX pendentes (fallback do webhook).
 *
 * Deve ser chamado periodicamente por um cron no servidor (VPS). Exemplo de
 * crontab executando a cada 2 minutos (substitua SEU_SEGREDO e SEU_DOMINIO):
 *
 *   [a cada 2 min] curl -s -X POST -H "x-cron-secret: SEU_SEGREDO" https://SEU_DOMINIO/api/payment/reconcile
 *
 * (use a expressão "asterisco-barra-2 asterisco asterisco asterisco asterisco" no campo de minutos do crontab)
 *
 * Para cada PIX ainda "pending" criado nas últimas 48h, consulta o status atual
 * no Pagar.me e atualiza pagamento/pedido (e dispara Bling) quando confirmado.
 */

async function resolveEnvironment(): Promise<IntegrationEnvironment> {
  try {
    const activeEnv = await getActiveEnvironment('pagarme')
    if (activeEnv) return activeEnv
  } catch {
    // fallback abaixo
  }

  try {
    const productionToken = await getToken('pagarme', 'production')
    if (productionToken) return 'production'
    const sandboxToken = await getToken('pagarme', 'sandbox')
    if (sandboxToken) return 'sandbox'
  } catch {
    // fallback abaixo
  }

  if (process.env.PAGARME_ENVIRONMENT === 'sandbox' || process.env.NODE_ENV === 'development') {
    return 'sandbox'
  }
  return 'production'
}

export async function POST(request: NextRequest) {
  // Proteção por segredo: o endpoint só funciona quando PAGARME_RECONCILE_SECRET está configurado
  const expectedSecret = process.env.PAGARME_RECONCILE_SECRET
  if (!expectedSecret || !expectedSecret.trim()) {
    return NextResponse.json(
      { error: 'Reconciliação não configurada (PAGARME_RECONCILE_SECRET ausente)' },
      { status: 503 }
    )
  }

  const providedSecret =
    request.headers.get('x-cron-secret') ||
    request.nextUrl.searchParams.get('secret') ||
    ''
  if (providedSecret.trim() !== expectedSecret.trim()) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const environment = await resolveEnvironment()

    // Selecionar PIX pendentes recentes (limite de janela para evitar consultar transações expiradas antigas)
    const pendingResult = await query(
      `SELECT pagarme_transaction_id, order_id
       FROM payments
       WHERE method = 'pix'
         AND status = 'pending'
         AND pagarme_transaction_id IS NOT NULL
         AND created_at > NOW() - INTERVAL '48 hours'
       ORDER BY created_at DESC
       LIMIT 100`
    )

    let checked = 0
    let updated = 0
    let errors = 0

    for (const row of pendingResult.rows) {
      const transactionId = row.pagarme_transaction_id as string
      const orderId = row.order_id as number
      checked++
      try {
        const result = await reconcilePaymentByTransaction(transactionId, environment, {
          orderIdFallback: orderId,
        })
        if (result.updated) updated++
      } catch (error: any) {
        errors++
        if (process.env.NODE_ENV === 'development') {
          console.error('[Payment Reconcile] Erro ao reconciliar', transactionId, error?.message)
        }
      }
    }

    if (updated > 0 || errors > 0) {
      await saveLog(
        updated > 0 ? 'info' : 'warning',
        `Reconciliação PIX: ${checked} verificados, ${updated} atualizados, ${errors} erros`,
        { checked, updated, errors, environment },
        'payment'
      )
    }

    return NextResponse.json({ success: true, checked, updated, errors })
  } catch (error: any) {
    await saveLog(
      'error',
      'Erro na reconciliação de pagamentos PIX',
      { error_message: error?.message || 'Erro desconhecido' },
      'payment'
    )
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro na reconciliação' },
      { status: 500 }
    )
  }
}
