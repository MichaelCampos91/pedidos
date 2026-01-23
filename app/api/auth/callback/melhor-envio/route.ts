import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth } from '@/lib/auth'
import { getToken, updateOAuth2Token, type IntegrationEnvironment } from '@/lib/integrations'
import { getOAuthBaseUrl } from '@/lib/melhor-envio-oauth'

// Forçar rota dinâmica (usa cookies e autenticação)
export const dynamic = 'force-dynamic'

/**
 * Callback OAuth2 do Melhor Envio
 * 
 * IMPORTANTE: URL de redirecionamento que DEVE ser configurada no app do Melhor Envio:
 * https://pedidos.lojacenario.com.br/api/auth/callback/melhor-envio
 * 
 * Esta URL é usada no fluxo OAuth2 authorization_code.
 * Configure esta URL EXATA na área de desenvolvedor do Melhor Envio.
 * A URL deve corresponder EXATAMENTE (incluindo protocolo, domínio e path).
 * 
 * Este endpoint recebe o código de autorização após o usuário autorizar
 * o aplicativo no Melhor Envio e troca pelo access_token + refresh_token
 * 
 * Para usar um domínio diferente, configure a variável MELHOR_ENVIO_REDIRECT_URI no .env
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value

    // Autenticação - usuário deve estar logado
    await requireAuth(request, cookieToken)

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state') // Pode conter environment (sandbox/production)
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Verificar se houve erro na autorização
    if (error) {
      console.error('[Melhor Envio OAuth2 Callback] Erro na autorização', {
        error,
        errorDescription,
      })
      
      return NextResponse.redirect(
        new URL(`/admin/integrations?error=${encodeURIComponent(`[Melhor Envio] ${errorDescription || error}`)}`, request.url)
      )
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/admin/integrations?error=[Sistema] Código de autorização não fornecido', request.url)
      )
    }

    // Determinar environment do state ou usar production como padrão
    const environment = (state === 'sandbox' ? 'sandbox' : 'production') as IntegrationEnvironment

    // Buscar token existente para obter client_id e client_secret
    const existingToken = await getToken('melhor_envio', environment)
    
    if (!existingToken?.additional_data?.client_id || !existingToken?.additional_data?.client_secret) {
      return NextResponse.redirect(
        new URL('/admin/integrations?error=[Sistema] Client ID e Client Secret não configurados. Configure primeiro na página de Integrações.', request.url)
      )
    }

    const baseUrl = getOAuthBaseUrl(environment)
    const tokenEndpoint = `${baseUrl}/oauth/token`

    // Trocar código de autorização por tokens
    // URL de callback deve corresponder EXATAMENTE à configurada no app do Melhor Envio
    // Esta URL está hardcoded porque deve ser exatamente: https://pedidos.lojacenario.com.br/api/auth/callback/melhor-envio
    // Se mudar o domínio, atualize também no app do Melhor Envio
    const redirectUri = process.env.MELHOR_ENVIO_REDIRECT_URI 
      || `https://pedidos.lojacenario.com.br/api/auth/callback/melhor-envio`
    
    console.log('[Melhor Envio OAuth2 Callback] Trocando código por token', {
      environment,
      tokenEndpoint,
      redirectUri,
      grantType: 'authorization_code',
    })
    
    const formData = new URLSearchParams()
    formData.append('grant_type', 'authorization_code')
    formData.append('code', code)
    formData.append('redirect_uri', redirectUri)

    const authHeader = Buffer.from(
      `${existingToken.additional_data.client_id}:${existingToken.additional_data.client_secret}`
    ).toString('base64')

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${authHeader}`,
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        message: `Erro HTTP ${response.status}: ${response.statusText}` 
      }))
      
      console.error('[Melhor Envio OAuth2 Callback] Erro ao trocar código por token', {
        environment,
        status: response.status,
        error: errorData,
      })
      
      return NextResponse.redirect(
        new URL(
          `/admin/integrations?error=${encodeURIComponent(`[Melhor Envio] Erro ao obter token: ${errorData.message || errorData.error || response.statusText}`)}`,
          request.url
        )
      )
    }

    const tokenData = await response.json()

    if (!tokenData.access_token) {
      return NextResponse.redirect(
        new URL('/admin/integrations?error=[Melhor Envio] Resposta OAuth2 inválida: access_token não encontrado', request.url)
      )
    }

    // Atualizar token no banco
    const oauthData: any = {
      refresh_token: tokenData.refresh_token || '',
      expires_in: tokenData.expires_in || 2592000,
      client_id: existingToken.additional_data.client_id,
      client_secret: existingToken.additional_data.client_secret,
      ...existingToken.additional_data,
    }

    await updateOAuth2Token(
      'melhor_envio',
      environment,
      tokenData.access_token,
      tokenData.refresh_token || '',
      tokenData.expires_in || 2592000,
      oauthData
    )

    console.log('[Melhor Envio OAuth2 Callback] Token obtido e salvo com sucesso', {
      environment,
      expiresIn: tokenData.expires_in,
    })

    // Redirecionar para página de integrações com sucesso
    return NextResponse.redirect(
      new URL('/admin/integrations?success=[Melhor Envio] Token OAuth2 configurado com sucesso', request.url)
    )
  } catch (error: any) {
    console.error('[Melhor Envio OAuth2 Callback] Erro:', error)
    
    return NextResponse.redirect(
      new URL(
        `/admin/integrations?error=${encodeURIComponent(`[Sistema] Erro ao processar callback OAuth2: ${error.message}`)}`,
        request.url
      )
    )
  }
}
