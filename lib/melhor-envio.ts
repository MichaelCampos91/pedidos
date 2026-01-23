import { getTokenWithFallback, getToken, updateOAuth2Token, type IntegrationEnvironment } from './integrations'
import { refreshOAuth2Token, isTokenExpired } from './melhor-envio-oauth'

const MELHOR_ENVIO_CEP_ORIGEM = process.env.MELHOR_ENVIO_CEP_ORIGEM || '16010000'

// URL base baseada no environment
function getBaseUrl(environment: IntegrationEnvironment): string {
  return environment === 'sandbox'
    ? 'https://sandbox.melhorenvio.com.br/api/v2/me'
    : 'https://melhorenvio.com.br/api/v2/me'
}

export interface ShippingQuoteParams {
  from: {
    postal_code: string
  }
  to: {
    postal_code: string
  }
  products: Array<{
    id: string
    width: number
    height: number
    length: number
    weight: number
    insurance_value: number
    quantity: number
  }>
  services?: string // IDs dos serviços separados por vírgula
}

export interface ShippingOption {
  id: number
  name: string
  company: {
    id: number
    name: string
  }
  price: string
  currency: string
  delivery_time: number
  delivery_range: {
    min: number
    max: number
  }
  packages: number
  additional_services?: any[]
}

// Função auxiliar para validar e limpar token
async function getCleanToken(environment: IntegrationEnvironment = 'production'): Promise<string> {
  const token = await getTokenWithFallback('melhor_envio', environment)
  
  if (!token) {
    console.error(`[Melhor Envio] Token não configurado para ambiente: ${environment}`)
    throw new Error(`[Sistema] Token do Melhor Envio não configurado para ${environment}. Configure na página de Integrações.`)
  }

  if (token.trim() === '') {
    console.error(`[Melhor Envio] Token está vazio para ambiente: ${environment}`)
    throw new Error(`[Sistema] Token do Melhor Envio está vazio para ${environment}. Configure na página de Integrações.`)
  }

  // Verificar se o token está mascarado (não deve estar)
  if (token.includes('****') || token.startsWith('****')) {
    console.error(`[Melhor Envio] Token parece estar mascarado para ambiente: ${environment}`, {
      tokenPreview: token.substring(0, 20),
    })
    throw new Error(`[Sistema] Token do Melhor Envio parece estar mascarado para ${environment}. Reconfigure o token na página de Integrações com o token completo.`)
  }

  // Remove espaços e "Bearer " se presente
  const cleanToken = token.trim().replace(/^Bearer\s+/i, '')
  
  // Verificar se o token tem tamanho mínimo razoável (tokens do Melhor Envio geralmente têm mais de 20 caracteres)
  if (cleanToken.length < 20) {
    console.error(`[Melhor Envio] Token muito curto para ambiente: ${environment}`, {
      tokenLength: cleanToken.length,
    })
    throw new Error(`[Sistema] Token do Melhor Envio parece estar incompleto para ${environment}. Verifique se o token foi copiado completamente.`)
  }
  
  console.log(`[Melhor Envio] Token recuperado para ${environment}`, {
    tokenLength: cleanToken.length,
    tokenPreview: `${cleanToken.substring(0, 4)}...${cleanToken.substring(cleanToken.length - 4)}`,
  })
  
  return cleanToken
}

export async function calculateShipping(
  params: ShippingQuoteParams,
  environment: IntegrationEnvironment = 'production'
): Promise<ShippingOption[]> {
  const cleanToken = await getCleanToken(environment)
  const baseUrl = getBaseUrl(environment)

  // Log detalhado do token (sem expor completamente por segurança)
  const tokenPreview = cleanToken 
    ? `${cleanToken.substring(0, 4)}...${cleanToken.substring(cleanToken.length - 4)}`
    : 'não configurado'
  
  console.log('[Melhor Envio] Calculando frete', {
    environment,
    from: params.from.postal_code,
    to: params.to.postal_code,
    products: params.products.length,
    tokenLength: cleanToken.length,
    tokenPreview: tokenPreview,
    url: `${baseUrl}/shipment/calculate`,
  })
  
  const headers = {
    'Authorization': `Bearer ${cleanToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'GerenciadorPedidos/1.0',
  }

  const requestBody = JSON.stringify(params)
  
  console.log('[Melhor Envio] Request details', {
    url: `${baseUrl}/shipment/calculate`,
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': `Bearer ${cleanToken.substring(0, 4)}...${cleanToken.substring(cleanToken.length - 4)}`,
    },
    bodyPreview: requestBody.substring(0, 200),
    bodySize: requestBody.length,
  })

  const response = await fetch(`${baseUrl}/shipment/calculate`, {
    method: 'POST',
    headers,
    body: requestBody,
  })

  // Log da resposta completa para debug
  const responseHeaders = Object.fromEntries(response.headers.entries())
  console.log('[Melhor Envio] Response status', {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    ok: response.ok,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    let errorData: any = {}
    
    try {
      errorData = JSON.parse(errorText)
    } catch {
      errorData = { message: errorText || `Erro HTTP ${response.status}: ${response.statusText}` }
    }
    
    console.error('[Melhor Envio] Erro na API', {
      environment,
      status: response.status,
      statusText: response.statusText,
      error: errorData,
      errorText: errorText.substring(0, 500),
      url: `${baseUrl}/shipment/calculate`,
      headers: Object.fromEntries(response.headers.entries()),
    })
    
    // Tratar erros específicos
    if (response.status === 401) {
      // Tentar renovar token automaticamente (OAuth2)
      try {
        const tokenRecord = await getToken('melhor_envio', environment)
        if (tokenRecord) {
          const refreshToken = tokenRecord.additional_data?.refresh_token
          const clientId = tokenRecord.additional_data?.client_id
          const clientSecret = tokenRecord.additional_data?.client_secret
          
          let newTokens: any = null
          
          // Tentar com refresh_token primeiro
          if (refreshToken) {
            try {
              console.log('[Melhor Envio] Tentando renovar token automaticamente com refresh_token após 401')
              newTokens = await refreshOAuth2Token(refreshToken, environment)
            } catch (refreshError: any) {
              console.warn('[Melhor Envio] Erro ao renovar com refresh_token:', refreshError.message)
            }
          }
          
          // Se não funcionou e temos client_credentials, tentar com eles
          if (!newTokens && clientId && clientSecret) {
            try {
              const { getOAuth2Token } = await import('./melhor-envio-oauth')
              console.log('[Melhor Envio] Tentando renovar token automaticamente com client_credentials após 401')
              newTokens = await getOAuth2Token({ client_id: clientId, client_secret: clientSecret }, environment)
            } catch (oauthError: any) {
              console.warn('[Melhor Envio] Erro ao renovar com client_credentials:', oauthError.message)
            }
          }
          
          if (newTokens) {
            await updateOAuth2Token(
              'melhor_envio',
              environment,
              newTokens.access_token,
              newTokens.refresh_token,
              newTokens.expires_in,
              tokenRecord.additional_data
            )
            
            // Tentar novamente com novo token
            console.log('[Melhor Envio] Token renovado, tentando novamente')
            const retryHeaders = {
              ...headers,
              'Authorization': `Bearer ${newTokens.access_token}`,
            }
            
            const retryResponse = await fetch(`${baseUrl}/shipment/calculate`, {
              method: 'POST',
              headers: retryHeaders,
              body: requestBody,
            })
            
            if (retryResponse.ok) {
              const retryData = await retryResponse.json()
              console.log('[Melhor Envio] Cotação realizada com sucesso após renovação de token', {
                options: retryData.length,
              })
              return retryData
            }
          }
        }
      } catch (refreshError: any) {
        console.error('[Melhor Envio] Erro ao tentar renovar token:', refreshError)
        // Continuar com erro original
      }
      
      // Se renovação falhou ou não foi possível, retornar erro
      console.error('[Melhor Envio] Token rejeitado na cotação', {
        environment,
        tokenLength: cleanToken.length,
        tokenPreview: `${cleanToken.substring(0, 4)}...${cleanToken.substring(cleanToken.length - 4)}`,
        errorDetails: errorData,
        suggestion: 'O token pode estar válido para consultas (GET) mas não ter permissões para calcular fretes (POST). Verifique as permissões do token na área de desenvolvedor do Melhor Envio.',
      })
      
      // Mensagem mais específica baseada no erro
      let errorMessage = '[Melhor Envio] Token inválido ou sem permissões para calcular frete.'
      if (errorData.message) {
        errorMessage += ` ${errorData.message}`
      } else if (errorData.error) {
        errorMessage += ` ${errorData.error}`
      }
      errorMessage += ' Verifique se o token tem as permissões necessárias na área de desenvolvedor do Melhor Envio.'
      
      throw new Error(errorMessage)
    }
    
    if (response.status === 422) {
      throw new Error(`[Melhor Envio] Dados inválidos: ${errorData.message || JSON.stringify(errorData) || 'Verifique os parâmetros da cotação'}`)
    }
    
    throw new Error(`[Melhor Envio] ${errorData.message || errorData.error || `Erro ao calcular frete: ${response.status} ${response.statusText}`}`)
  }

  const data = await response.json()
  console.log('[Melhor Envio] Cotação realizada com sucesso', {
    options: data.length,
  })
  return data
}

export async function getShippingServices(
  environment: IntegrationEnvironment = 'production'
): Promise<any[]> {
  const cleanToken = await getCleanToken(environment)
  const baseUrl = getBaseUrl(environment)

  const response = await fetch(`${baseUrl}/shipment/services`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${cleanToken}`,
      'Accept': 'application/json',
      'User-Agent': 'GerenciadorPedidos/1.0',
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ 
      message: `Erro HTTP ${response.status}: ${response.statusText}` 
    }))
    
    console.error('[Melhor Envio] Erro ao buscar serviços', {
      status: response.status,
      statusText: response.statusText,
      error: errorData,
    })
    
    if (response.status === 401) {
      throw new Error('[Melhor Envio] Token inválido ou expirado. Configure ou valide o token na página de Integrações.')
    }
    
    throw new Error(`[Melhor Envio] ${errorData.message || 'Erro ao buscar serviços de envio'}`)
  }

  return response.json()
}

// Funções de formatação foram movidas para lib/melhor-envio-utils.ts
// para evitar importar código do servidor no cliente
// Use: import { formatShippingPrice, formatDeliveryTime } from '@/lib/melhor-envio-utils'

// Função para validar/testar o token
export async function validateToken(
  environment: IntegrationEnvironment = 'production'
): Promise<{ valid: boolean; message: string; details?: any }> {
  try {
    const cleanToken = await getCleanToken(environment)
    const baseUrl = getBaseUrl(environment)
    
    // Primeiro tenta validar com GET /shipment/services
    const servicesResponse = await fetch(`${baseUrl}/shipment/services`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Accept': 'application/json',
        'User-Agent': 'GerenciadorPedidos/1.0',
      },
    })

    // Se o GET funcionar, também tenta validar com um POST simples para garantir que o token tem permissões para POST
    let canCalculate = false
    if (servicesResponse.ok) {
      // Testa se o token funciona para POST também (usando um CEP de teste)
      const testCalculateResponse = await fetch(`${baseUrl}/shipment/calculate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'GerenciadorPedidos/1.0',
        },
        body: JSON.stringify({
          from: { postal_code: '01310100' },
          to: { postal_code: '01310100' },
          products: [{
            id: '1',
            width: 10,
            height: 10,
            length: 10,
            weight: 0.3,
            insurance_value: 100,
            quantity: 1,
          }],
        }),
      })

      canCalculate = testCalculateResponse.ok

      if (testCalculateResponse.status === 401) {
        const errorData = await testCalculateResponse.json().catch(() => ({}))
        console.error('[Melhor Envio] Validação: Token funciona para GET mas não para POST', {
          environment,
          getStatus: servicesResponse.status,
          postStatus: testCalculateResponse.status,
          error: errorData,
        })
        return {
          valid: false,
          message: '[Melhor Envio] Token válido para consultas mas sem permissão para calcular fretes. Verifique as permissões do token na área de desenvolvedor do Melhor Envio.',
          details: {
            status: testCalculateResponse.status,
            canListServices: true,
            canCalculate: false,
            environment,
            error: errorData,
          }
        }
      }

      if (!testCalculateResponse.ok && testCalculateResponse.status !== 422) {
        // 422 é esperado se os dados de teste forem inválidos, mas outros erros indicam problema
        const errorData = await testCalculateResponse.json().catch(() => ({}))
        console.error('[Melhor Envio] Validação: Erro ao testar cálculo', {
          environment,
          status: testCalculateResponse.status,
          error: errorData,
        })
      }
    }

    const response = servicesResponse

    if (response.status === 401) {
      const errorData = await response.json().catch(() => ({}))
      return {
        valid: false,
        message: `[Melhor Envio] Token inválido ou expirado. Status: ${response.status}. ${errorData.message || 'Verifique se o token está correto e não expirou.'}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          environment,
        }
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        valid: false,
        message: `[Melhor Envio] Erro ao validar token: ${response.status} ${response.statusText}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          environment,
        }
      }
    }

    const data = await response.json().catch(() => null)
    return {
      valid: true,
      message: canCalculate 
        ? '[Melhor Envio] Token válido e com permissões para calcular fretes'
        : '[Melhor Envio] Token válido para consultas (teste de cálculo não realizado)',
      details: {
        environment,
        servicesCount: Array.isArray(data) ? data.length : null,
        canListServices: true,
        canCalculate: canCalculate,
      }
    }
  } catch (error: any) {
    return {
      valid: false,
      message: `[Sistema] Erro ao validar token: ${error.message}`,
      details: {
        environment,
        error: error.message,
      }
    }
  }
}
