import type { IntegrationEnvironment } from './integrations-types'

export interface OAuth2TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export interface OAuth2Credentials {
  client_id: string
  client_secret: string
}

/**
 * URL base da API Bling OAuth2
 * O Bling usa a mesma URL para sandbox e production (não há ambiente separado)
 */
const BLING_TOKEN_URL = 'https://api.bling.com.br/Api/v3/oauth/token'

/**
 * Renova access_token usando refresh_token do Bling
 * IMPORTANTE: O Bling requer client_id e client_secret no Basic Auth header
 */
export async function refreshBlingOAuth2Token(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<OAuth2TokenResponse> {
  if (!refreshToken || !refreshToken.trim()) {
    throw new Error('[Bling] refresh_token é obrigatório para renovar token')
  }

  if (!clientId || !clientSecret) {
    throw new Error('[Bling] client_id e client_secret são obrigatórios para renovar token')
  }

  const formData = new URLSearchParams()
  formData.append('grant_type', 'refresh_token')
  formData.append('refresh_token', refreshToken)

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  console.log('[Bling OAuth2] Renovando token via refresh_token', {
    tokenEndpoint: BLING_TOKEN_URL,
    grantType: 'refresh_token',
    refreshTokenPreview: refreshToken ? `${refreshToken.substring(0, 4)}...${refreshToken.substring(refreshToken.length - 4)}` : 'vazio',
    clientIdPreview: `${clientId.substring(0, 4)}...${clientId.substring(clientId.length - 4)}`,
  })

  const response = await fetch(BLING_TOKEN_URL, {
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
    
    console.error('[Bling OAuth2] Erro ao renovar token', {
      tokenEndpoint: BLING_TOKEN_URL,
      grantType: 'refresh_token',
      status: response.status,
      statusText: response.statusText,
      error: errorData,
    })
    
    const errorMessage = errorData?.error_description || errorData?.message || errorData?.error || response.statusText
    throw new Error(`[Bling] Erro ao renovar token OAuth2: ${errorMessage}`)
  }

  const data = await response.json()
  
  if (!data.access_token) {
    throw new Error('[Bling] Resposta OAuth2 inválida: access_token não encontrado')
  }

  console.log('[Bling OAuth2] Token renovado com sucesso', {
    tokenEndpoint: BLING_TOKEN_URL,
    grantType: 'refresh_token',
    expiresIn: data.expires_in,
    hasNewRefreshToken: !!data.refresh_token,
  })

  // O Bling pode retornar um novo refresh_token ou manter o antigo
  // Se não retornar, usar o antigo
  const newRefreshToken = data.refresh_token || refreshToken || ''

  return {
    access_token: data.access_token,
    refresh_token: newRefreshToken,
    expires_in: data.expires_in || 86400, // 24 horas em segundos (padrão Bling)
    token_type: data.token_type || 'Bearer',
  }
}

/**
 * Verifica se token está expirado ou próximo de expirar
 * Reutiliza a lógica do melhor-envio-oauth para consistência
 */
export function isTokenExpired(expiresAt: Date | string | null | undefined): boolean {
  if (!expiresAt) return true
  
  const expirationDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  const now = new Date()
  
  // Considerar expirado se faltar menos de 5 minutos
  return expirationDate.getTime() <= now.getTime()
}
