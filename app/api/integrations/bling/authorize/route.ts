import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getToken, type IntegrationEnvironment } from '@/lib/integrations'

export const dynamic = 'force-dynamic'

const BLING_AUTHORIZE_URL = 'https://www.bling.com.br/Api/v3/oauth/authorize'

function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || 'https://pedidos.lojacenario.com.br'
}

/**
 * Gera URL de autorização OAuth2 para o Bling.
 * Retorna URL para redirecionar o usuário e autorizar o app no Bling.
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const searchParams = request.nextUrl.searchParams
    const environment = (searchParams.get('environment') || 'production') as IntegrationEnvironment

    if (!['sandbox', 'production'].includes(environment)) {
      return NextResponse.json(
        { error: '[Sistema] Environment inválido. Use: sandbox ou production' },
        { status: 400 }
      )
    }

    let clientId: string | undefined
    let clientSecret: string | undefined

    const existingToken = await getToken('bling', environment)
    if (existingToken?.additional_data?.client_id) {
      clientId = existingToken.additional_data.client_id as string
      clientSecret = existingToken.additional_data.client_secret as string | undefined
    }
    if (!clientId) {
      clientId = process.env.BLING_CLIENT_ID
      clientSecret = process.env.BLING_CLIENT_SECRET
    }

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: '[Sistema] Client ID e Client Secret não configurados. Configure na página de Integrações (Bling) ou nas variáveis BLING_CLIENT_ID e BLING_CLIENT_SECRET.' },
        { status: 400 }
      )
    }

    const appBaseUrl = getAppBaseUrl()
    const redirectUri = process.env.BLING_REDIRECT_URI
      || `${appBaseUrl}/api/auth/callback/bling`

    const authorizationUrl = `${BLING_AUTHORIZE_URL}?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(environment)}`

    return NextResponse.json({
      authorization_url: authorizationUrl,
      environment,
      redirect_uri: redirectUri,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
      return authErrorResponse(msg, 401)
    }
    return NextResponse.json(
      { error: `[Sistema] Erro ao gerar URL de autorização: ${msg}` },
      { status: 500 }
    )
  }
}
