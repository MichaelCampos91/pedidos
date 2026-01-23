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
 * Obtém access_token e refresh_token via OAuth2
 */
export async function getOAuth2Token(
  credentials: OAuth2Credentials,
  environment: IntegrationEnvironment
): Promise<OAuth2TokenResponse> {
  const baseUrl = environment === 'sandbox'
    ? 'https://sandbox.melhorenvio.com.br'
    : 'https://melhorenvio.com.br'

  const authHeader = Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString('base64')

  // Melhor Envio pode usar application/x-www-form-urlencoded ou JSON
  // Tentando primeiro com form-urlencoded (padrão OAuth2)
  const formData = new URLSearchParams()
  formData.append('grant_type', 'client_credentials')
  formData.append('client_id', credentials.client_id)
  formData.append('client_secret', credentials.client_secret)

  const response = await fetch(`${baseUrl}/oauth/token`, {
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
    
    console.error('[Melhor Envio OAuth2] Erro ao obter token', {
      environment,
      status: response.status,
      error: errorData,
    })
    
    throw new Error(`[Melhor Envio] Erro ao obter token OAuth2: ${errorData.message || errorData.error || response.statusText}`)
  }

  const data = await response.json()
  
  if (!data.access_token) {
    throw new Error('[Melhor Envio] Resposta OAuth2 inválida: access_token não encontrado')
  }

  // refresh_token pode não estar presente em grant_type=client_credentials
  // Se não estiver, o token precisará ser renovado usando client_credentials novamente
  if (!data.refresh_token) {
    console.warn('[Melhor Envio OAuth2] refresh_token não retornado. Token precisará ser renovado usando client_credentials.')
  }

  console.log('[Melhor Envio OAuth2] Token obtido com sucesso', {
    environment,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
  })

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || '', // Pode estar vazio se não retornado
    expires_in: data.expires_in || 2592000, // 30 dias em segundos (padrão)
    token_type: data.token_type || 'Bearer',
  }
}

/**
 * Renova access_token usando refresh_token
 */
export async function refreshOAuth2Token(
  refreshToken: string,
  environment: IntegrationEnvironment
): Promise<OAuth2TokenResponse> {
  const baseUrl = environment === 'sandbox'
    ? 'https://sandbox.melhorenvio.com.br'
    : 'https://melhorenvio.com.br'

  const formData = new URLSearchParams()
  formData.append('grant_type', 'refresh_token')
  formData.append('refresh_token', refreshToken)

  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: formData.toString(),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ 
      message: `Erro HTTP ${response.status}: ${response.statusText}` 
    }))
    
    console.error('[Melhor Envio OAuth2] Erro ao renovar token', {
      environment,
      status: response.status,
      error: errorData,
    })
    
    throw new Error(`[Melhor Envio] Erro ao renovar token OAuth2: ${errorData.message || errorData.error || response.statusText}`)
  }

  const data = await response.json()
  
  if (!data.access_token) {
    throw new Error('[Melhor Envio] Resposta OAuth2 inválida: access_token não encontrado')
  }

  console.log('[Melhor Envio OAuth2] Token renovado com sucesso', {
    environment,
    expiresIn: data.expires_in,
  })

  // Se não retornar refresh_token, tentar usar o antigo ou retornar vazio
  // (dependendo da implementação do Melhor Envio)
  const newRefreshToken = data.refresh_token || refreshToken || ''

  return {
    access_token: data.access_token,
    refresh_token: newRefreshToken,
    expires_in: data.expires_in || 2592000,
    token_type: data.token_type || 'Bearer',
  }
}

/**
 * Calcula data de expiração baseada em expires_in
 */
export function calculateExpirationDate(expiresIn: number): Date {
  // Subtrair 5 minutos para renovar antes de expirar
  const expirationTime = Date.now() + (expiresIn * 1000) - (5 * 60 * 1000)
  return new Date(expirationTime)
}

/**
 * Verifica se token está expirado ou próximo de expirar
 */
export function isTokenExpired(expiresAt: Date | string | null | undefined): boolean {
  if (!expiresAt) return true
  
  const expirationDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  const now = new Date()
  
  // Considerar expirado se faltar menos de 5 minutos
  return expirationDate.getTime() <= now.getTime()
}
