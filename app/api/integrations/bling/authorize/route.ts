import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getToken, type IntegrationEnvironment } from '@/lib/integrations'

export const dynamic = 'force-dynamic'

const BLING_AUTHORIZE_URL = 'https://www.bling.com.br/Api/v3/oauth/authorize'

/** IDs de escopo do Bling (data-scope do painel): Integrações Logísticas, Pedidos de Venda, Clientes e Fornecedores (Contatos), Produtos e sub-escopos. */
const BLING_SCOPE_IDS = [
  '220621674', // Integrações Logísticas
  '98310',     // Pedidos de Venda
  '318257568', // Pedidos de Venda: Exclusão
  '318257556', // Pedidos de Venda: Gerenciar
  '791588404', // Pedidos de Venda: Gerenciar situações
  '363921589', // Pedidos de Venda: Lançar contas
  '363921592', // Pedidos de Venda: Lançar estoque
  '98308',     // Clientes e Fornecedores
  '318257565', // Clientes e Fornecedores: Gerenciar Contatos
  '98309',     // Produtos
  '318257583', // Produtos: Exclusão
  '318257570', // Produtos: Gerenciar
  '106168710', // Produtos: Salvar imagens
  '199272829', // Produtos: Salvar variações
]

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

    const scopeString = BLING_SCOPE_IDS.join(' ')
    const authorizationUrl = `${BLING_AUTHORIZE_URL}?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(environment)}&scope=${encodeURIComponent(scopeString)}`

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
