import { query } from './database'
import type {
  IntegrationProvider,
  IntegrationEnvironment,
  TokenType,
  ValidationStatus,
  IntegrationToken,
} from './integrations-types'

// Re-exportar tipos (para compatibilidade com código do servidor)
export type {
  IntegrationProvider,
  IntegrationEnvironment,
  TokenType,
  ValidationStatus,
  IntegrationToken,
} from './integrations-types'

// Tipos específicos do servidor
export interface TokenStatus {
  valid: boolean
  status: ValidationStatus
  message: string
  error?: string
  details?: Record<string, any>
}

/**
 * Busca token do banco de dados por provider e environment
 */
export async function getToken(
  provider: IntegrationProvider,
  environment: IntegrationEnvironment
): Promise<IntegrationToken | null> {
  const result = await query(
    `SELECT * FROM integration_tokens 
     WHERE provider = $1 AND environment = $2 AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [provider, environment]
  )

  if (result.rows.length === 0) {
    return null
  }

  return result.rows[0] as IntegrationToken
}

/**
 * Lista todos os tokens
 */
export async function getAllTokens(): Promise<IntegrationToken[]> {
  const result = await query(
    `SELECT * FROM integration_tokens 
     ORDER BY provider, environment, created_at DESC`
  )

  return result.rows as IntegrationToken[]
}

/**
 * Valida se um token não está mascarado
 * Tokens mascarados não devem ser salvos no banco
 */
function validateTokenNotMasked(tokenValue: string, context: string): void {
  if (!tokenValue || tokenValue.trim() === '') {
    throw new Error(`[Sistema] Token não pode estar vazio (${context})`)
  }

  // Verificar se token está mascarado (contém **** ou começa com ****)
  if (tokenValue.includes('****') || tokenValue.startsWith('****')) {
    console.error('[Integrations] Tentativa de salvar token mascarado rejeitada', {
      context,
      tokenPreview: tokenValue.substring(0, 20),
    })
    throw new Error(`[Sistema] Token não pode estar mascarado. Por favor, forneça o token completo (${context}).`)
  }

  // Verificar tamanho mínimo (tokens do Melhor Envio geralmente têm mais de 20 caracteres)
  const cleanToken = tokenValue.trim().replace(/^Bearer\s+/i, '')
  if (cleanToken.length < 20) {
    console.warn('[Integrations] Token muito curto', {
      context,
      tokenLength: cleanToken.length,
    })
    // Não rejeitar, apenas avisar - pode ser um token válido de outro provider
  }
}

/**
 * Cria ou atualiza um token
 * CRÍTICO: Tokens nunca devem ser salvos mascarados no banco
 */
// NOTA: tokenType sempre será 'bearer' (único tipo que funciona)
export async function upsertToken(
  provider: IntegrationProvider,
  environment: IntegrationEnvironment,
  tokenValue: string,
  tokenType: TokenType = 'bearer', // Sempre 'bearer' (único tipo que funciona)
  additionalData?: Record<string, any>,
  expiresAt?: Date | string
): Promise<IntegrationToken> {
  // Validar que token não está mascarado
  validateTokenNotMasked(tokenValue, `upsertToken(${provider}, ${environment})`)

  // Log de auditoria (sem expor token completo)
  const tokenPreview = tokenValue.length > 8 
    ? `${tokenValue.substring(0, 4)}...${tokenValue.substring(tokenValue.length - 4)}`
    : '****'
  
  console.log('[Integrations] Salvando token no banco', {
    provider,
    environment,
    tokenType,
    tokenLength: tokenValue.length,
    tokenPreview,
    hasExpiresAt: !!expiresAt,
  })

  const result = await query(
    `INSERT INTO integration_tokens 
     (provider, environment, token_value, token_type, additional_data, is_active, expires_at)
     VALUES ($1, $2, $3, $4, $5, true, $6)
     ON CONFLICT (provider, environment) 
     DO UPDATE SET 
       token_value = EXCLUDED.token_value,
       token_type = EXCLUDED.token_type,
       additional_data = EXCLUDED.additional_data,
       expires_at = EXCLUDED.expires_at,
       is_active = true,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      provider,
      environment,
      tokenValue,
      tokenType,
      additionalData ? JSON.stringify(additionalData) : null,
      expiresAt || null,
    ]
  )

  console.log('[Integrations] Token salvo com sucesso', {
    provider,
    environment,
    tokenId: result.rows[0].id,
  })

  return result.rows[0] as IntegrationToken
}

/**
 * Atualiza token e refresh_token (para OAuth2)
 * CRÍTICO: Valida que access_token não está mascarado antes de salvar
 */
export async function updateOAuth2Token(
  provider: IntegrationProvider,
  environment: IntegrationEnvironment,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  additionalData?: Record<string, any>
): Promise<IntegrationToken> {
  // Validar que access_token não está mascarado
  validateTokenNotMasked(accessToken, `updateOAuth2Token(${provider}, ${environment})`)

  const expiresAt = new Date(Date.now() + (expiresIn * 1000) - (5 * 60 * 1000)) // 5 min antes
  
  const oauthData: Record<string, any> = {
    expires_in: expiresIn,
    ...additionalData,
  }

  // Só adicionar refresh_token se fornecido (pode não estar disponível em client_credentials)
  // Validar refresh_token também se fornecido
  if (refreshToken) {
    validateTokenNotMasked(refreshToken, `updateOAuth2Token refresh_token(${provider}, ${environment})`)
    oauthData.refresh_token = refreshToken
  }

  console.log('[Integrations] Atualizando token OAuth2', {
    provider,
    environment,
    expiresIn,
    hasRefreshToken: !!refreshToken,
    expiresAt,
  })

  return upsertToken(
    provider,
    environment,
    accessToken,
    'bearer',
    oauthData,
    expiresAt
  )
}

/**
 * Atualiza status de validação do token
 */
export async function updateTokenValidation(
  id: number,
  status: ValidationStatus,
  error?: string,
  details?: Record<string, any>
): Promise<void> {
  await query(
    `UPDATE integration_tokens 
     SET last_validated_at = CURRENT_TIMESTAMP,
         last_validation_status = $1,
         last_validation_error = $2,
         additional_data = COALESCE(additional_data, '{}'::jsonb) || $3::jsonb
     WHERE id = $4`,
    [
      status,
      error || null,
      details ? JSON.stringify(details) : '{}',
      id,
    ]
  )
}

/**
 * Desativa um token
 */
export async function deactivateToken(
  provider: IntegrationProvider,
  environment: IntegrationEnvironment
): Promise<void> {
  await query(
    `UPDATE integration_tokens 
     SET is_active = false, updated_at = CURRENT_TIMESTAMP
     WHERE provider = $1 AND environment = $2`,
    [provider, environment]
  )
}

/**
 * Remove um token
 */
export async function deleteToken(
  provider: IntegrationProvider,
  environment: IntegrationEnvironment
): Promise<void> {
  await query(
    `DELETE FROM integration_tokens 
     WHERE provider = $1 AND environment = $2`,
    [provider, environment]
  )
}

/**
 * Busca token com fallback para variável de ambiente (compatibilidade)
 * E verifica/renova automaticamente se expirado (OAuth2)
 */
export async function getTokenWithFallback(
  provider: IntegrationProvider,
  environment: IntegrationEnvironment,
  autoRefresh: boolean = true
): Promise<string | null> {
  // Primeiro tenta buscar do banco
  const token = await getToken(provider, environment)
  if (token) {
    const tokenValue = token.token_value
    
    // Verificar se o token está mascarado (não deveria estar no banco)
    if (tokenValue && (tokenValue.includes('****') || tokenValue.startsWith('****'))) {
      console.error(`[Integrations] Token mascarado encontrado no banco para ${provider} (${environment}). Token precisa ser reconfigurado.`)
      return null
    }
    
    // Verificar expiração e renovar se necessário (OAuth2)
    if (autoRefresh && provider === 'melhor_envio' && token.expires_at) {
      try {
        const { isTokenExpired, refreshOAuth2Token } = await import('./melhor-envio-oauth')
        
        if (isTokenExpired(token.expires_at)) {
          const refreshToken = token.additional_data?.refresh_token
          const clientId = token.additional_data?.client_id
          const clientSecret = token.additional_data?.client_secret
          
          // Tentar renovar com refresh_token primeiro, se disponível
          if (refreshToken) {
            try {
              console.log(`[Integrations] Token expirado, renovando automaticamente com refresh_token para ${provider} (${environment})`)
              const newTokens = await refreshOAuth2Token(refreshToken, environment)
              await updateOAuth2Token(
                provider,
                environment,
                newTokens.access_token,
                newTokens.refresh_token,
                newTokens.expires_in,
                token.additional_data
              )
              console.log(`[Integrations] Token renovado com sucesso para ${provider} (${environment})`)
              return newTokens.access_token
            } catch (error: any) {
              console.error(`[Integrations] Erro ao renovar com refresh_token: ${error.message}`)
              // Se falhar, tentar com client_credentials se disponível
            }
          }
          
          // Se não tiver refresh_token ou falhou, tentar com client_credentials
          if (clientId && clientSecret) {
            try {
              const { getOAuth2Token } = await import('./melhor-envio-oauth')
              console.log(`[Integrations] Renovando token com client_credentials para ${provider} (${environment})`)
              const newTokens = await getOAuth2Token({ client_id: clientId, client_secret: clientSecret }, environment)
              await updateOAuth2Token(
                provider,
                environment,
                newTokens.access_token,
                newTokens.refresh_token,
                newTokens.expires_in,
                token.additional_data
              )
              console.log(`[Integrations] Token renovado com sucesso usando client_credentials para ${provider} (${environment})`)
              return newTokens.access_token
            } catch (error: any) {
              console.error(`[Integrations] Erro ao renovar com client_credentials: ${error.message}`)
              // Continuar com token antigo, pode ainda funcionar
            }
          }
        }
      } catch (importError) {
        // Se não conseguir importar, continuar sem renovação automática
        console.warn('[Integrations] Não foi possível carregar módulo OAuth2 para renovação automática')
      }
    }
    
    console.log(`[Integrations] Token recuperado do banco para ${provider} (${environment})`, {
      tokenLength: tokenValue?.length || 0,
      tokenPreview: tokenValue ? `${tokenValue.substring(0, 4)}...${tokenValue.substring(tokenValue.length - 4)}` : 'vazio',
      hasToken: !!tokenValue,
      expiresAt: token.expires_at,
    })
    
    return tokenValue
  }

  // Fallback para variáveis de ambiente (compatibilidade - será removido no futuro)
  const envKey = getEnvKey(provider, environment)
  const envToken = process.env[envKey] || null
  
  if (envToken) {
    console.warn(`[Integrations] Usando token de variável de ambiente ${envKey} como fallback. Configure o token no banco de dados pela página de Integrações.`)
  } else {
    console.warn(`[Integrations] Token não encontrado no banco nem em variáveis de ambiente para ${provider} (${environment})`)
  }
  
  return envToken
}

/**
 * Retorna a chave da variável de ambiente para um provider
 */
function getEnvKey(
  provider: IntegrationProvider,
  environment: IntegrationEnvironment
): string {
  const keys: Record<string, Record<string, string>> = {
    melhor_envio: {
      sandbox: 'MELHOR_ENVIO_TOKEN_SANDBOX',
      production: 'MELHOR_ENVIO_TOKEN',
    },
    pagarme: {
      sandbox: 'PAGARME_API_KEY_SANDBOX',
      production: 'PAGARME_API_KEY',
    },
    bling: {
      sandbox: 'BLING_API_KEY_SANDBOX',
      production: 'BLING_API_KEY',
    },
  }

  return keys[provider]?.[environment] || ''
}
