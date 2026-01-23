const MELHOR_ENVIO_TOKEN = process.env.MELHOR_ENVIO_TOKEN
const MELHOR_ENVIO_BASE_URL = 'https://melhorenvio.com.br/api/v2/me'
const MELHOR_ENVIO_CEP_ORIGEM = process.env.MELHOR_ENVIO_CEP_ORIGEM || '16010000'

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
function getCleanToken(): string {
  if (!MELHOR_ENVIO_TOKEN) {
    console.error('[Melhor Envio] MELHOR_ENVIO_TOKEN não configurada')
    throw new Error('MELHOR_ENVIO_TOKEN não configurada. Configure a variável de ambiente.')
  }

  if (MELHOR_ENVIO_TOKEN.trim() === '') {
    console.error('[Melhor Envio] MELHOR_ENVIO_TOKEN está vazia')
    throw new Error('MELHOR_ENVIO_TOKEN está vazia. Configure a variável de ambiente.')
  }

  // Remove espaços e "Bearer " se presente
  return MELHOR_ENVIO_TOKEN.trim().replace(/^Bearer\s+/i, '')
}

export async function calculateShipping(params: ShippingQuoteParams): Promise<ShippingOption[]> {
  const cleanToken = getCleanToken()

  // Log detalhado do token (sem expor completamente por segurança)
  const tokenPreview = cleanToken 
    ? `${cleanToken.substring(0, 4)}...${cleanToken.substring(cleanToken.length - 4)}`
    : 'não configurado'
  
  console.log('[Melhor Envio] Calculando frete', {
    from: params.from.postal_code,
    to: params.to.postal_code,
    products: params.products.length,
    tokenLength: cleanToken.length,
    tokenPreview: tokenPreview,
    url: `${MELHOR_ENVIO_BASE_URL}/shipment/calculate`,
  })
  
  const headers = {
    'Authorization': `Bearer ${cleanToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'GerenciadorPedidos/1.0',
  }

  const response = await fetch(`${MELHOR_ENVIO_BASE_URL}/shipment/calculate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ 
      message: `Erro HTTP ${response.status}: ${response.statusText}` 
    }))
    
    console.error('[Melhor Envio] Erro na API', {
      status: response.status,
      statusText: response.statusText,
      error: errorData,
      url: `${MELHOR_ENVIO_BASE_URL}/shipment/calculate`,
    })
    
    // Tratar erros específicos
    if (response.status === 401) {
      throw new Error('Token do Melhor Envio inválido ou expirado. Verifique MELHOR_ENVIO_TOKEN.')
    }
    
    if (response.status === 422) {
      throw new Error(`Dados inválidos: ${errorData.message || 'Verifique os parâmetros da cotação'}`)
    }
    
    throw new Error(errorData.message || `Erro ao calcular frete: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  console.log('[Melhor Envio] Cotação realizada com sucesso', {
    options: data.length,
  })
  return data
}

export async function getShippingServices(): Promise<any[]> {
  const cleanToken = getCleanToken()

  const response = await fetch(`${MELHOR_ENVIO_BASE_URL}/shipment/services`, {
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
      throw new Error('Token do Melhor Envio inválido ou expirado. Verifique MELHOR_ENVIO_TOKEN.')
    }
    
    throw new Error(errorData.message || 'Erro ao buscar serviços de envio')
  }

  return response.json()
}

export function formatShippingPrice(price: string): string {
  const value = parseFloat(price)
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDeliveryTime(days: number): string {
  if (days === 1) {
    return '1 dia útil'
  }
  return `${days} dias úteis`
}

// Função para validar/testar o token
export async function validateToken(): Promise<{ valid: boolean; message: string }> {
  try {
    const cleanToken = getCleanToken()
    
    // Tenta fazer uma chamada simples para validar o token
    const response = await fetch(`${MELHOR_ENVIO_BASE_URL}/shipment/services`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Accept': 'application/json',
        'User-Agent': 'GerenciadorPedidos/1.0',
      },
    })

    if (response.status === 401) {
      const errorData = await response.json().catch(() => ({}))
      return {
        valid: false,
        message: `Token inválido ou expirado. Status: ${response.status}. ${errorData.message || 'Verifique se o token está correto e não expirou.'}`
      }
    }

    if (!response.ok) {
      return {
        valid: false,
        message: `Erro ao validar token: ${response.status} ${response.statusText}`
      }
    }

    return {
      valid: true,
      message: 'Token válido'
    }
  } catch (error: any) {
    return {
      valid: false,
      message: `Erro ao validar token: ${error.message}`
    }
  }
}
