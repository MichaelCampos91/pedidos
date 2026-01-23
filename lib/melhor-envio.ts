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

export async function calculateShipping(params: ShippingQuoteParams): Promise<ShippingOption[]> {
  if (!MELHOR_ENVIO_TOKEN) {
    throw new Error('MELHOR_ENVIO_TOKEN não configurada')
  }

  const response = await fetch(`${MELHOR_ENVIO_BASE_URL}/shipment/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'GerenciadorPedidos/1.0',
    },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
    throw new Error(error.message || 'Erro ao calcular frete')
  }

  const data = await response.json()
  return data
}

export async function getShippingServices(): Promise<any[]> {
  if (!MELHOR_ENVIO_TOKEN) {
    throw new Error('MELHOR_ENVIO_TOKEN não configurada')
  }

  const response = await fetch(`${MELHOR_ENVIO_BASE_URL}/shipment/services`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN}`,
      'Accept': 'application/json',
      'User-Agent': 'GerenciadorPedidos/1.0',
    },
  })

  if (!response.ok) {
    throw new Error('Erro ao buscar serviços de envio')
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
