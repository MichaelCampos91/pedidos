import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getToken, type IntegrationEnvironment } from '@/lib/integrations'
import { generateAuthorizationUrl } from '@/lib/melhor-envio-oauth'

// Forçar rota dinâmica (usa cookies e autenticação)
export const dynamic = 'force-dynamic'

/**
 * Gera URL de autorização OAuth2 para o Melhor Envio
 * Retorna URL para redirecionar o usuário e autorizar o app
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
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

    // Buscar token existente para obter client_id
    const existingToken = await getToken('melhor_envio', environment)
    
    if (!existingToken?.additional_data?.client_id) {
      return NextResponse.json(
        { error: '[Sistema] Client ID não configurado. Configure primeiro na página de Integrações.' },
        { status: 400 }
      )
    }

    const clientId = existingToken.additional_data.client_id
    const redirectUri = process.env.MELHOR_ENVIO_REDIRECT_URI 
      || `https://pedidos.lojacenario.com.br/api/auth/callback/melhor-envio`

    // Gerar URL de autorização com scopes necessários
    const authorizationUrl = generateAuthorizationUrl(
      environment,
      clientId,
      redirectUri,
      ['shipping-calculate', 'shipping-read'] // Scopes necessários para calcular e ler fretes
    )

    console.log('[Melhor Envio OAuth2] URL de autorização gerada', {
      environment,
      clientIdPreview: `${clientId.substring(0, 4)}...${clientId.substring(clientId.length - 4)}`,
      redirectUri,
    })

    return NextResponse.json({
      authorization_url: authorizationUrl,
      environment,
      redirect_uri: redirectUri,
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    
    console.error('[Melhor Envio OAuth2] Erro ao gerar URL de autorização:', error)
    
    return NextResponse.json(
      { error: `[Sistema] Erro ao gerar URL de autorização: ${error.message}` },
      { status: 500 }
    )
  }
}
