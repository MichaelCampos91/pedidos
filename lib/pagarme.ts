const PAGARME_API_KEY = process.env.PAGARME_API_KEY
const PAGARME_BASE_URL = 'https://api.pagar.me/core/v5'

interface CreateTransactionParams {
  amount: number // em centavos
  payment_method: 'pix' | 'credit_card'
  customer: {
    name: string
    email: string
    document: string // CPF
    phone: {
      country_code: string
      area_code: string
      number: string
    }
  }
  billing?: {
    name: string
    address: {
      street: string
      number: string
      complement?: string
      neighborhood: string
      city: string
      state: string
      zip_code: string
    }
  }
  credit_card?: {
    card_id?: string
    card_token?: string
    installments?: number
    statement_descriptor?: string
  }
  metadata?: {
    order_id: string
    [key: string]: any
  }
}

interface PagarmeTransaction {
  id: string
  status: string
  amount: number
  payment_method: string
  pix_qr_code?: string
  pix_expiration_date?: string
  [key: string]: any
}

export async function createPixTransaction(params: CreateTransactionParams): Promise<PagarmeTransaction> {
  if (!PAGARME_API_KEY) {
    throw new Error('PAGARME_API_KEY não configurada')
  }

  const response = await fetch(`${PAGARME_BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(PAGARME_API_KEY + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [
        {
          amount: params.amount,
          description: 'Pedido',
          quantity: 1,
        },
      ],
      customer: params.customer,
      payments: [
        {
          payment_method: 'pix',
          pix: {
            expires_in: 3600, // 1 hora
          },
        },
      ],
      metadata: params.metadata || {},
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
    throw new Error(error.message || 'Erro ao criar transação Pix')
  }

  const data = await response.json()
  
  // Buscar o pagamento Pix na resposta
  const pixPayment = data.charges?.[0]?.last_transaction
  if (!pixPayment) {
    throw new Error('Resposta inválida do Pagar.me')
  }

  return {
    id: data.id,
    status: pixPayment.status || 'pending',
    amount: params.amount,
    payment_method: 'pix',
    pix_qr_code: pixPayment.qr_code,
    pix_expiration_date: pixPayment.expires_at,
    ...data,
  }
}

export async function createCreditCardTransaction(params: CreateTransactionParams): Promise<PagarmeTransaction> {
  if (!PAGARME_API_KEY) {
    throw new Error('PAGARME_API_KEY não configurada')
  }

  if (!params.credit_card) {
    throw new Error('Dados do cartão são obrigatórios')
  }

  const response = await fetch(`${PAGARME_BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(PAGARME_API_KEY + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [
        {
          amount: params.amount,
          description: 'Pedido',
          quantity: 1,
        },
      ],
      customer: params.customer,
      payments: [
        {
          payment_method: 'credit_card',
          credit_card: {
            installments: params.credit_card.installments || 1,
            statement_descriptor: params.credit_card.statement_descriptor || 'PEDIDO',
            card: params.credit_card.card_id
              ? { id: params.credit_card.card_id }
              : params.credit_card.card_token
              ? { token: params.credit_card.card_token }
              : undefined,
          },
          billing_address: params.billing?.address,
        },
      ],
      metadata: params.metadata || {},
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
    throw new Error(error.message || 'Erro ao criar transação de cartão')
  }

  const data = await response.json()
  
  // Buscar o pagamento de cartão na resposta
  const cardPayment = data.charges?.[0]?.last_transaction
  if (!cardPayment) {
    throw new Error('Resposta inválida do Pagar.me')
  }

  return {
    id: data.id,
    status: cardPayment.status || 'pending',
    amount: params.amount,
    payment_method: 'credit_card',
    ...data,
  }
}

export async function getTransaction(transactionId: string): Promise<PagarmeTransaction> {
  if (!PAGARME_API_KEY) {
    throw new Error('PAGARME_API_KEY não configurada')
  }

  const response = await fetch(`${PAGARME_BASE_URL}/orders/${transactionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(PAGARME_API_KEY + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Erro ao buscar transação')
  }

  return response.json()
}

// Função para validar token do Pagar.me
export async function validateToken(apiKey: string): Promise<{ valid: boolean; message: string; details?: any }> {
  try {
    // Tenta fazer uma chamada simples para validar o token
    // Usamos o endpoint de listar pedidos com limite mínimo
    const response = await fetch(`${PAGARME_BASE_URL}/orders?size=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
    })

    if (response.status === 401) {
      const errorData = await response.json().catch(() => ({}))
      return {
        valid: false,
        message: `Token inválido ou expirado. Status: ${response.status}. ${errorData.message || 'Verifique se a API key está correta.'}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        }
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        valid: false,
        message: `Erro ao validar token: ${response.status} ${response.statusText}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        }
      }
    }

    return {
      valid: true,
      message: 'Token válido',
      details: {
        status: response.status,
      }
    }
  } catch (error: any) {
    return {
      valid: false,
      message: `Erro ao validar token: ${error.message}`,
      details: {
        error: error.message,
      }
    }
  }
}
