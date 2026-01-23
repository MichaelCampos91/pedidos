// Tipos para integrações que podem ser usados no cliente
// (sem importar código do servidor)

export type IntegrationProvider = 'melhor_envio' | 'pagarme' | 'bling'
export type IntegrationEnvironment = 'sandbox' | 'production'
export type TokenType = 'bearer' | 'basic' | 'api_key'
export type ValidationStatus = 'valid' | 'invalid' | 'error' | 'pending'

export interface OAuth2TokenData {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  expires_at?: Date | string
}

export interface MelhorEnvioTokenData extends OAuth2TokenData {
  client_id?: string
  client_secret?: string
  cep_origem?: string
}

export interface IntegrationToken {
  id: number
  provider: IntegrationProvider
  environment: IntegrationEnvironment
  token_value: string
  token_type: TokenType
  additional_data?: Record<string, any>
  is_active: boolean
  last_validated_at?: Date | string
  last_validation_status?: ValidationStatus
  last_validation_error?: string
  expires_at?: Date | string
  created_at: Date | string
  updated_at: Date | string
}
