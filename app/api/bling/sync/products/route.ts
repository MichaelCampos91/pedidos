import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getTokenWithFallback } from '@/lib/integrations'
import { syncProductsToBling } from '@/lib/bling'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json().catch(() => ({}))
    const sinceDate = body?.sinceDate
    if (!sinceDate || typeof sinceDate !== 'string') {
      return NextResponse.json(
        { error: 'sinceDate (YYYY-MM-DD) é obrigatório.' },
        { status: 400 }
      )
    }

    const tokenValue = await getTokenWithFallback('bling', 'production')
    if (!tokenValue) {
      return NextResponse.json(
        { error: '[Sistema] Integração Bling não configurada.' },
        { status: 400 }
      )
    }

    const result = await syncProductsToBling(sinceDate, tokenValue)
    if (result.success) {
      return NextResponse.json({ success: true, syncedCount: result.syncedCount })
    }
    return NextResponse.json(
      { success: false, error: result.error, syncedCount: result.syncedCount },
      { status: 400 }
    )
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = (err as { message: string }).message
      if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
        return authErrorResponse(msg, 401)
      }
    }
    const errorMessage = err instanceof Error ? err.message : 'Erro ao sincronizar produtos.'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
