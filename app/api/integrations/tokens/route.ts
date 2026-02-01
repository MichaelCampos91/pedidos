import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getAllTokens, getToken, upsertToken, type IntegrationProvider, type IntegrationEnvironment } from '@/lib/integrations'

// Marca a rota como dinâmica porque usa cookies para autenticação
export const dynamic = 'force-dynamic'

// Lista todos os tokens
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const tokens = await getAllTokens()

    // Mascarar tokens na resposta (mostrar apenas últimos 4 caracteres)
    const maskedTokens = tokens.map(token => ({
      ...token,
      token_value: token.token_value 
        ? `****${token.token_value.substring(token.token_value.length - 4)}`
        : null,
    }))

    return NextResponse.json({ tokens: maskedTokens })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: '[Sistema] Erro ao listar tokens' },
      { status: 500 }
    )
  }
}

// Cria ou atualiza um token
// NOTA: Apenas modo "Token direto (legacy)" funciona
// NOTA: Tipo de token sempre será "bearer" (definido automaticamente)
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { provider, environment, token_value, additional_data, cep_origem, public_key } = body

    if (!provider || !environment) {
      return NextResponse.json(
        { error: '[Sistema] Provider e environment são obrigatórios' },
        { status: 400 }
      )
    }

    // Bling OAuth: permite salvar apenas client_id e client_secret (configuração pré-OAuth) com token_value placeholder
    const isBlingOAuthConfig = provider === 'bling' &&
      additional_data?.client_id &&
      additional_data?.client_secret &&
      (token_value === undefined || token_value === null || String(token_value).trim() === '' || String(token_value).trim() === '__oauth_pending__')

    if (isBlingOAuthConfig) {
      // Validar que client_id e client_secret estão presentes (já garantido acima)
      const clientId = String(additional_data.client_id).trim()
      const clientSecret = String(additional_data.client_secret).trim()
      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { error: '[Sistema] Para Bling (OAuth), Client ID e Client Secret são obrigatórios em additional_data' },
          { status: 400 }
        )
      }
    } else if (!token_value) {
      // NOTA: Para outros providers, token_value é obrigatório
      return NextResponse.json(
        { error: '[Sistema] token_value é obrigatório' },
        { status: 400 }
      )
    }

    if (!['melhor_envio', 'pagarme', 'bling'].includes(provider)) {
      return NextResponse.json(
        { error: '[Sistema] Provider inválido. Use: melhor_envio, pagarme ou bling' },
        { status: 400 }
      )
    }

    if (!['sandbox', 'production'].includes(environment)) {
      return NextResponse.json(
        { error: '[Sistema] Environment inválido. Use: sandbox ou production' },
        { status: 400 }
      )
    }

    // Verificar se o token não está mascarado (exceto Bling OAuth config que usa placeholder)
    if (!isBlingOAuthConfig && (String(token_value).includes('****') || String(token_value).startsWith('****'))) {
      console.error('[Integrations] Tentativa de salvar token mascarado rejeitada', {
        provider,
        environment,
        tokenPreview: String(token_value).substring(0, 20),
      })
      return NextResponse.json(
        { error: '[Sistema] Token não pode estar mascarado. Por favor, cole o token completo.' },
        { status: 400 }
      )
    }

    // Limpar o token (remover espaços e "Bearer " se presente). Bling OAuth config usa placeholder,
    // mas ao editar preservamos o access_token existente se já houver um token real.
    let cleanTokenValue: string
    if (isBlingOAuthConfig) {
      const existingBling = await getToken(provider as IntegrationProvider, environment as IntegrationEnvironment)
      const hasRealToken = existingBling?.token_value &&
        existingBling.token_value !== '__oauth_pending__' &&
        !existingBling.token_value.includes('****')
      cleanTokenValue = hasRealToken ? existingBling!.token_value : '__oauth_pending__'
    } else {
      cleanTokenValue = String(token_value).trim().replace(/^Bearer\s+/i, '')
    }

    // Validação adicional de tamanho mínimo (não aplicar para Bling OAuth placeholder)
    if (!isBlingOAuthConfig && cleanTokenValue.length < 20) {
      console.warn('[Integrations] Token muito curto', {
        provider,
        environment,
        tokenLength: cleanTokenValue.length,
      })
      // Não rejeitar, apenas avisar - pode ser um token válido de outro provider
    }

    console.log(`[Integrations] Salvando token para ${provider} (${environment})`, {
      tokenLength: cleanTokenValue.length,
      tokenPreview: `${cleanTokenValue.substring(0, 4)}...${cleanTokenValue.substring(cleanTokenValue.length - 4)}`,
      note: 'Tipo de token sempre será "bearer" (definido automaticamente)',
    })

    // Para Pagar.me, se public_key não foi fornecida ou está vazia mas já existe no banco, manter a existente
    let finalPublicKey = public_key && public_key.trim() ? public_key.trim() : null
    if (provider === 'pagarme' && !finalPublicKey) {
      const existingToken = await getToken(provider as IntegrationProvider, environment as IntegrationEnvironment)
      if (existingToken?.additional_data?.public_key) {
        finalPublicKey = existingToken.additional_data.public_key
        console.log('[Integrations] Mantendo public_key existente do banco para Pagar.me')
      }
    }

    const additionalData: any = {
      ...additional_data,
      ...(cep_origem && { cep_origem }),
      ...(provider === 'pagarme' && finalPublicKey && { public_key: finalPublicKey }),
    }

    // NOTA: token_type sempre será 'bearer' (definido automaticamente no upsertToken)
    const token = await upsertToken(
      provider as IntegrationProvider,
      environment as IntegrationEnvironment,
      cleanTokenValue,
      'bearer', // Sempre usar bearer
      additionalData
    )

    // Mascarar token na resposta
    const maskedToken = {
      ...token,
      token_value: `****${token.token_value.substring(token.token_value.length - 4)}`,
    }

    return NextResponse.json({ token: maskedToken, success: true })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    
    // Adicionar prefixo se não tiver
    let errorMessage = error.message || 'Erro ao salvar token'
    if (!errorMessage.includes('[')) {
      errorMessage = `[Sistema] ${errorMessage}`
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
