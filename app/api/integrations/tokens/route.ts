import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getAllTokens, getToken, upsertToken, updateOAuth2Token, type IntegrationProvider, type IntegrationEnvironment, type TokenType } from '@/lib/integrations'
import { getOAuth2Token, calculateExpirationDate } from '@/lib/melhor-envio-oauth'

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
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { provider, environment, token_value, token_type, additional_data, client_id, client_secret, cep_origem } = body

    if (!provider || !environment) {
      return NextResponse.json(
        { error: '[Sistema] Provider e environment são obrigatórios' },
        { status: 400 }
      )
    }

    // Suportar dois modos: OAuth2 (client_id/secret) ou token direto (legacy)
    // Se está editando e tem client_id mas não forneceu secret, buscar do banco
    let finalClientSecret = client_secret
    if (provider === 'melhor_envio' && client_id && !client_secret && !token_value) {
      // Tentar buscar token existente para pegar secret salvo
      const existingToken = await getToken(provider as IntegrationProvider, environment as IntegrationEnvironment)
      if (existingToken?.additional_data?.client_secret) {
        finalClientSecret = existingToken.additional_data.client_secret
        console.log('[Integrations] Usando client_secret salvo do banco para renovação OAuth2')
      }
    }

    const isOAuth2Mode = provider === 'melhor_envio' && client_id && finalClientSecret && !token_value
    const isTokenMode = !!token_value

    if (!isOAuth2Mode && !isTokenMode) {
      return NextResponse.json(
        { error: '[Sistema] Forneça token_value (modo legacy) ou client_id + client_secret (OAuth2)' },
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

    let token

    if (isOAuth2Mode) {
      // Modo OAuth2: obter tokens via OAuth2
      try {
        if (!finalClientSecret) {
          return NextResponse.json(
            { error: '[Sistema] Client Secret é obrigatório para OAuth2' },
            { status: 400 }
          )
        }

        console.log(`[Integrations] Obtendo token OAuth2 para ${provider} (${environment})`)
        const oauthTokens = await getOAuth2Token(
          { client_id, client_secret: finalClientSecret },
          environment as IntegrationEnvironment
        )

        const oauthData: any = {
          refresh_token: oauthTokens.refresh_token,
          expires_in: oauthTokens.expires_in,
          client_id, // Armazenar para futuras renovações
          client_secret: finalClientSecret, // Armazenar para futuras renovações (quando refresh_token não disponível)
          ...(cep_origem && { cep_origem }),
          ...additional_data,
        }

        token = await updateOAuth2Token(
          provider as IntegrationProvider,
          environment as IntegrationEnvironment,
          oauthTokens.access_token,
          oauthTokens.refresh_token,
          oauthTokens.expires_in,
          oauthData
        )

        console.log(`[Integrations] Token OAuth2 obtido e salvo para ${provider} (${environment})`, {
          expiresIn: oauthTokens.expires_in,
        })
      } catch (error: any) {
        console.error(`[Integrations] Erro ao obter token OAuth2:`, error)
        return NextResponse.json(
          { error: `[Melhor Envio] Erro ao obter token OAuth2: ${error.message}` },
          { status: 500 }
        )
      }
    } else {
      // Modo legacy: token direto
      // Verificar se o token não está mascarado
      if (token_value.includes('****') || token_value.startsWith('****')) {
        console.error('[Integrations] Tentativa de salvar token mascarado rejeitada', {
          provider,
          environment,
          tokenPreview: token_value.substring(0, 20),
        })
        return NextResponse.json(
          { error: '[Sistema] Token não pode estar mascarado. Por favor, cole o token completo.' },
          { status: 400 }
        )
      }

      // Limpar o token (remover espaços e "Bearer " se presente)
      const cleanTokenValue = token_value.trim().replace(/^Bearer\s+/i, '')

      // Validação adicional de tamanho mínimo
      if (cleanTokenValue.length < 20) {
        console.warn('[Integrations] Token muito curto', {
          provider,
          environment,
          tokenLength: cleanTokenValue.length,
        })
        // Não rejeitar, apenas avisar - pode ser um token válido de outro provider
      }

      console.log(`[Integrations] Salvando token (legacy) para ${provider} (${environment})`, {
        tokenLength: cleanTokenValue.length,
        tokenPreview: `${cleanTokenValue.substring(0, 4)}...${cleanTokenValue.substring(cleanTokenValue.length - 4)}`,
      })

      const legacyAdditionalData: any = {
        ...additional_data,
        ...(cep_origem && { cep_origem }),
      }

      token = await upsertToken(
        provider as IntegrationProvider,
        environment as IntegrationEnvironment,
        cleanTokenValue,
        (token_type || 'bearer') as TokenType,
        legacyAdditionalData
      )
    }

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
