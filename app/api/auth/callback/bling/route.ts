import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth } from '@/lib/auth'
import { getToken, updateOAuth2Token, type IntegrationEnvironment } from '@/lib/integrations'

export const dynamic = 'force-dynamic'

const BLING_TOKEN_URL = 'https://api.bling.com.br/Api/v3/oauth/token'

function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || 'https://pedidos.lojacenario.com.br'
}

/**
 * Callback OAuth2 do Bling.
 * URL de redirecionamento que deve ser configurada no app do Bling (Informações do app):
 * https://seudominio.com/api/auth/callback/bling
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    const appBaseUrl = getAppBaseUrl()

    if (error) {
      return NextResponse.redirect(
        new URL(`/admin/integrations?error=${encodeURIComponent(`[Bling] ${errorDescription || error}`)}`, appBaseUrl)
      )
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/admin/integrations?error=[Sistema] Código de autorização não fornecido', appBaseUrl)
      )
    }

    const environment = (state === 'sandbox' ? 'sandbox' : 'production') as IntegrationEnvironment

    let clientId: string
    let clientSecret: string

    const existingToken = await getToken('bling', environment)
    if (existingToken?.additional_data?.client_id && existingToken?.additional_data?.client_secret) {
      clientId = existingToken.additional_data.client_id as string
      clientSecret = existingToken.additional_data.client_secret as string
    } else if (process.env.BLING_CLIENT_ID && process.env.BLING_CLIENT_SECRET) {
      clientId = process.env.BLING_CLIENT_ID
      clientSecret = process.env.BLING_CLIENT_SECRET
    } else {
      return NextResponse.redirect(
        new URL('/admin/integrations?error=[Sistema] Client ID e Client Secret não configurados. Configure na página de Integrações (Bling).', appBaseUrl)
      )
    }

    const redirectUri = process.env.BLING_REDIRECT_URI
      || `${appBaseUrl}/api/auth/callback/bling`

    const formData = new URLSearchParams()
    formData.append('grant_type', 'authorization_code')
    formData.append('code', code)
    formData.append('redirect_uri', redirectUri)

    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const response = await fetch(BLING_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }))
      const errMsg = errorData?.error_description || errorData?.message || errorData?.error || response.statusText
      return NextResponse.redirect(
        new URL(`/admin/integrations?error=${encodeURIComponent(`[Bling] Erro ao obter token: ${errMsg}`)}`, appBaseUrl)
      )
    }

    const tokenData = (await response.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }

    if (!tokenData.access_token) {
      return NextResponse.redirect(
        new URL('/admin/integrations?error=[Bling] Resposta OAuth2 inválida: access_token não encontrado', appBaseUrl)
      )
    }

    const expiresIn = tokenData.expires_in ?? 2592000

    await updateOAuth2Token(
      'bling',
      environment,
      tokenData.access_token,
      tokenData.refresh_token ?? '',
      expiresIn,
      { client_id: clientId, client_secret: clientSecret }
    )

    return NextResponse.redirect(
      new URL('/admin/integrations?success=[Bling] Token OAuth2 configurado com sucesso', appBaseUrl)
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    const appBaseUrl = getAppBaseUrl()
    return NextResponse.redirect(
      new URL(`/admin/integrations?error=${encodeURIComponent(`[Sistema] Erro ao processar callback Bling: ${msg}`)}`, appBaseUrl)
    )
  }
}
