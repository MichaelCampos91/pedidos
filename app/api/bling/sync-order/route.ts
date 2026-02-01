import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { syncOrderToBling } from '@/lib/bling'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const orderId = body?.orderId != null ? Number(body.orderId) : NaN
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { error: 'orderId inválido.' },
        { status: 400 }
      )
    }

    const result = await syncOrderToBling(orderId)

    if (result.success) {
      return NextResponse.json({
        success: true,
        blingId: result.blingId,
        message: 'Pedido enviado ao Bling com sucesso.',
      })
    }

    return NextResponse.json(
      { error: result.error ?? 'Falha ao enviar pedido ao Bling.' },
      { status: 400 }
    )
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = (err as { message: string }).message
      if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
        return authErrorResponse(msg, 401)
      }
    }
    const errorMessage = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Erro ao sincronizar pedido com o Bling.'
    return NextResponse.json(
      { error: errorMessage || 'Erro ao sincronizar pedido com o Bling.' },
      { status: 500 }
    )
  }
}
