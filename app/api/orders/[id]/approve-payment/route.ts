import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { syncOrderToBling } from '@/lib/bling'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const orderId = parseInt(params.id)
    if (isNaN(orderId)) {
      return NextResponse.json({ error: 'ID do pedido inválido' }, { status: 400 })
    }

    const orderResult = await query('SELECT * FROM orders WHERE id = $1', [orderId])
    if (orderResult.rows.length === 0) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    }

    const order = orderResult.rows[0]
    const timestamp = new Date().toISOString()
    const observationLine = `\n#Pagamento aprovado manualmente em: ${timestamp}.`

    const existingPayment = await query(
      'SELECT id FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [orderId]
    )

    if (existingPayment.rows.length > 0) {
      await query(
        `UPDATE payments SET method = $1, status = $2, paid_at = CURRENT_TIMESTAMP WHERE order_id = $3`,
        ['pix_manual', 'paid', orderId]
      )
    } else {
      await query(
        `INSERT INTO payments (order_id, method, amount, status, paid_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [orderId, 'pix_manual', parseFloat(order.total || 0), 'paid']
      )
    }

    await query(
      `UPDATE orders SET paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
        observations = COALESCE(observations, '') || $1
       WHERE id = $2`,
      [observationLine, orderId]
    )

    try {
      await syncOrderToBling(orderId)
    } catch (_e) {
      // Falha no Bling não quebra o fluxo de aprovação; status fica pendente para reenvio manual
    }

    return NextResponse.json({ success: true, message: 'Pagamento aprovado manualmente' })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('Erro ao aprovar pagamento manualmente:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao aprovar pagamento' },
      { status: 500 }
    )
  }
}
