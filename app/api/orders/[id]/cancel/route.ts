import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { saveLog } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    const user = await requireAuth(request, cookieToken)

    const orderId = parseInt(params.id)
    if (isNaN(orderId)) {
      return NextResponse.json({ error: 'ID do pedido inválido' }, { status: 400 })
    }

    // Buscar pedido atual
    const orderResult = await query('SELECT * FROM orders WHERE id = $1', [orderId])
    if (orderResult.rows.length === 0) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    }

    const order = orderResult.rows[0]

    // Validações
    if (order.status === 'enviado') {
      return NextResponse.json(
        { error: 'Não é possível cancelar um pedido que já foi enviado.' },
        { status: 400 }
      )
    }

    if (order.status === 'cancelados') {
      return NextResponse.json(
        { error: 'Este pedido já está cancelado.' },
        { status: 400 }
      )
    }

    const oldStatus = order.status
    const timestamp = new Date().toISOString()
    const observationLine = `\n#Pedido cancelado em: ${timestamp}.`

    // Buscar pagamento atual
    const paymentResult = await query(
      'SELECT id, status FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [orderId]
    )

    const oldPaymentStatus = paymentResult.rows.length > 0 ? paymentResult.rows[0].status : null

    // Atualizar status do pedido para "cancelados"
    await query(
      `UPDATE orders 
       SET status = $1, updated_at = CURRENT_TIMESTAMP,
           observations = COALESCE(observations, '') || $2
       WHERE id = $3`,
      ['cancelados', observationLine, orderId]
    )

    // Atualizar status do pagamento para "cancelado" se existir
    if (paymentResult.rows.length > 0) {
      await query(
        `UPDATE payments SET status = $1 WHERE order_id = $2`,
        ['cancelado', orderId]
      )
    }

    // Registrar mudança no histórico - status do pedido
    await query(
      `INSERT INTO order_history (order_id, field_changed, old_value, new_value, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, 'status', oldStatus, 'cancelados', user.id]
    )

    // Registrar mudança no histórico - status do pagamento (se existir)
    if (oldPaymentStatus) {
      await query(
        `INSERT INTO order_history (order_id, field_changed, old_value, new_value, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, 'payment_status', oldPaymentStatus, 'cancelado', user.id]
      )
    }

    // Adicionar observação sobre Bling se já foi sincronizado
    if (order.bling_sync_status === 'synced') {
      const blingObservation = `\n#ATENÇÃO: Pedido foi cancelado após sincronização com Bling.`
      await query(
        `UPDATE orders SET observations = COALESCE(observations, '') || $1 WHERE id = $2`,
        [blingObservation, orderId]
      )
    }

    // Log de cancelamento
    await saveLog(
      'warning',
      `Pedido #${orderId} cancelado`,
      {
        order_id: orderId,
        previous_status: oldStatus,
        previous_payment_status: oldPaymentStatus,
        canceled_by: user.id,
        bling_sync_status: order.bling_sync_status,
      },
      'order'
    )

    return NextResponse.json({ 
      success: true, 
      message: 'Pedido cancelado com sucesso' 
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('Erro ao cancelar pedido:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao cancelar pedido' },
      { status: 500 }
    )
  }
}
