import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getToken, type IntegrationEnvironment } from '@/lib/integrations'
import { renewCorreiosToken } from '@/lib/correios-contrato'

// Marca a rota como dinâmica porque usa cookies para autenticação
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json().catch(() => ({}))
    const { environment = 'production' } = body as { environment?: IntegrationEnvironment }

    if (!['sandbox', 'production'].includes(environment)) {
      return NextResponse.json(
        { error: '[Sistema] Environment inválido. Use: sandbox ou production' },
        { status: 400 }
      )
    }

    const env = environment as IntegrationEnvironment

    // Gera/renova o token via API Token dos Correios
    const token = await renewCorreiosToken(env)

    // Buscar novamente para garantir que estamos com os metadados atualizados
    const refreshed = await getToken('correios_contrato', env)

    return NextResponse.json({
      success: true,
      environment: env,
      last_renewed_at: refreshed?.last_renewed_at ?? null,
      expires_at: refreshed?.expires_at ?? null,
      // Nunca retornar o token em texto plano; apenas um preview curto
      token_preview: token.token_value
        ? `${token.token_value.substring(0, 4)}...${token.token_value.substring(token.token_value.length - 4)}`
        : null,
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }

    let message = error.message || 'Erro ao renovar token do Contrato Correios'
    if (!message.includes('[')) {
      message = `[Sistema] ${message}`
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

