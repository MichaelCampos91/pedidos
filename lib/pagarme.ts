import { getTokenWithFallback } from './integrations'
import type { IntegrationEnvironment } from './integrations-types'

// URLs base para sandbox e produção
const PAGARME_BASE_URLS = {
  sandbox: 'https://api.pagar.me/core/v5',
  production: 'https://api.pagar.me/core/v5',
}

/**
 * Obtém a URL base da API do Pagar.me baseado no ambiente
 */
function getBaseUrl(environment: IntegrationEnvironment = 'production'): string {
  return PAGARME_BASE_URLS[environment] || PAGARME_BASE_URLS.production
}

/**
 * Obtém o token do Pagar.me do banco ou variável de ambiente (fallback)
 */
async function getApiKey(environment: IntegrationEnvironment = 'production'): Promise<string> {
  const token = await getTokenWithFallback('pagarme', environment)
  if (!token) {
    throw new Error(`Token do Pagar.me não configurado para ambiente ${environment}`)
  }
  return token
}

interface CreateTransactionParams {
  amount: number // em centavos
  payment_method: 'pix' | 'credit_card'
  customer: {
    name: string
    email: string
    document: string // CPF
    type?: 'individual' | 'company' // Tipo do cliente (individual para CPF, company para CNPJ)
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
  items?: Array<{
    id: number
    product_id?: number | null
    title: string
    price: number
    quantity: number
  }>
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

export async function createPixTransaction(
  params: CreateTransactionParams,
  environment: IntegrationEnvironment = 'production'
): Promise<PagarmeTransaction> {
  const apiKey = await getApiKey(environment)
  const baseUrl = getBaseUrl(environment)

  // Validar campos obrigatórios
  if (!params.amount || params.amount <= 0) {
    throw new Error('Valor do pedido é obrigatório e deve ser maior que zero')
  }
  
  // Validar customer completo
  if (!params.customer) {
    throw new Error('Dados do cliente são obrigatórios')
  }
  
  if (!params.customer.name || params.customer.name.trim().length < 3) {
    throw new Error('Nome do cliente é obrigatório e deve ter pelo menos 3 caracteres')
  }
  
  if (!params.customer.email || !params.customer.email.includes('@')) {
    throw new Error('Email do cliente é obrigatório e deve ser válido')
  }
  
  if (!params.customer.document || params.customer.document.replace(/\D/g, '').length !== 11) {
    throw new Error('CPF do cliente é obrigatório e deve ser válido (11 dígitos)')
  }
  
  if (!params.customer.phone) {
    throw new Error('Telefone do cliente é obrigatório')
  }
  
  if (!params.customer.phone.country_code || !params.customer.phone.area_code || !params.customer.phone.number) {
    throw new Error('Telefone do cliente deve ter country_code, area_code e number')
  }
  
  if (params.customer.phone.country_code !== '55') {
    throw new Error('Código do país deve ser 55 (Brasil)')
  }
  
  if (params.customer.phone.area_code.length !== 2) {
    throw new Error('DDD (area_code) deve ter 2 dígitos')
  }
  
  if (params.customer.phone.number.length < 8 || params.customer.phone.number.length > 9) {
    throw new Error('Número de telefone deve ter 8 ou 9 dígitos')
  }

  // Validação final do phone antes de montar requestBody
  if (!params.customer.phone || !params.customer.phone.country_code || !params.customer.phone.area_code || !params.customer.phone.number) {
    throw new Error('Telefone do cliente é obrigatório e deve estar no formato {country_code, area_code, number}')
  }

  // Preparar itens com código
  const items = params.items && params.items.length > 0
    ? params.items.map(item => ({
        amount: Math.round(parseFloat(item.price.toString()) * 100 * parseInt(item.quantity.toString())),
        description: item.title,
        quantity: parseInt(item.quantity.toString()),
        code: item.product_id ? `prod-${item.product_id}` : `item-${item.id}`,
      }))
    : [{
        amount: params.amount,
        description: 'Pedido',
        quantity: 1,
        code: `order-${params.metadata?.order_id || 'unknown'}`,
      }]

  console.log('[Pagar.me PIX] Itens formatados para Pagar.me:', {
    itemsCount: items.length,
    items: items.map(item => ({
      code: item.code,
      description: item.description,
      quantity: item.quantity,
      amount: item.amount,
    })),
  })

  // Preparar request body com customer explícito (garantindo que phone está presente)
  // IMPORTANTE: Pagar.me espera "phones" (plural) como objeto com mobile_phone e/ou home_phone
  const customerPhone = {
    country_code: String(params.customer.phone.country_code),
    area_code: String(params.customer.phone.area_code),
    number: String(params.customer.phone.number),
  }
  
  const requestBody: any = {
    items,
    customer: {
      name: String(params.customer.name),
      email: String(params.customer.email),
      document: String(params.customer.document),
      type: String(params.customer.type || 'individual'),
      phones: {
        mobile_phone: customerPhone,
      },
    },
    payments: [
      {
        payment_method: 'pix',
        pix: {
          expires_in: 3600, // 1 hora em segundos
        },
      },
    ],
  }
  
  // Verificação final crítica antes de enviar
  if (!requestBody.customer.phones || !requestBody.customer.phones.mobile_phone || !requestBody.customer.phones.mobile_phone.country_code || !requestBody.customer.phones.mobile_phone.area_code || !requestBody.customer.phones.mobile_phone.number) {
    console.error('[Pagar.me PIX] ERRO CRÍTICO: Phone não está presente no requestBody!', {
      requestBodyCustomer: requestBody.customer,
      paramsCustomerPhone: params.customer.phone,
    })
    throw new Error('Telefone do cliente não está presente no requestBody. Erro crítico na montagem dos dados.')
  }

  // Adicionar billing address se fornecido (opcional para PIX, mas recomendado)
  // NOTA: Para PIX, billing_address vai no nível raiz do requestBody
  if (params.billing?.address) {
    requestBody.billing_address = {
      street: String(params.billing.address.street || '').substring(0, 126),
      number: String(params.billing.address.number || 'S/N'),
      complement: String(params.billing.address.complement || ''),
      neighborhood: String(params.billing.address.neighborhood || ''),
      city: String(params.billing.address.city || ''),
      state: String(params.billing.address.state || '').toUpperCase().substring(0, 2),
      zip_code: String(params.billing.address.zip_code || '').replace(/\D/g, '').substring(0, 8),
      country: 'BR',
    }
  }

  // Adicionar metadata se fornecido
  if (params.metadata) {
    requestBody.metadata = params.metadata
  }

  // Log detalhado do customer recebido
  console.log('[Pagar.me PIX] Customer recebido em params:', {
    name: params.customer?.name,
    email: params.customer?.email,
    hasDocument: !!params.customer?.document,
    documentPreview: params.customer?.document ? `${params.customer.document.substring(0, 3)}***` : 'N/A',
    type: params.customer?.type || 'individual',
    hasPhone: !!params.customer?.phone,
    phone: params.customer?.phone ? {
      country_code: params.customer.phone.country_code,
      area_code: params.customer.phone.area_code,
      number: params.customer.phone.number,
      fullPhone: `+${params.customer.phone.country_code}${params.customer.phone.area_code}${params.customer.phone.number}`,
    } : 'N/A',
    phoneValid: !!(params.customer?.phone?.country_code && params.customer?.phone?.area_code && params.customer?.phone?.number),
  })

  console.log('[Pagar.me PIX] Criando transação', {
    environment,
    amount: params.amount,
    hasCustomer: !!params.customer,
    customerName: params.customer?.name,
    customerDocument: params.customer?.document ? `${params.customer.document.substring(0, 3)}***` : 'N/A',
    customerPhone: params.customer?.phone ? `+${params.customer.phone.country_code} (${params.customer.phone.area_code}) ${params.customer.phone.number}` : 'N/A',
    hasBilling: !!params.billing,
    itemsCount: items.length,
    baseUrl,
    apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'N/A',
  })

  // Log detalhado do requestBody.customer antes de enviar
  console.log('[Pagar.me PIX] RequestBody.customer completo antes de enviar:', {
    name: requestBody.customer.name,
    email: requestBody.customer.email,
    hasDocument: !!requestBody.customer.document,
    documentPreview: requestBody.customer.document ? `${requestBody.customer.document.substring(0, 3)}***` : 'N/A',
    type: requestBody.customer.type,
    hasPhones: !!requestBody.customer.phones,
    hasMobilePhone: !!requestBody.customer.phones?.mobile_phone,
    mobilePhone: requestBody.customer.phones?.mobile_phone ? {
      country_code: requestBody.customer.phones.mobile_phone.country_code,
      area_code: requestBody.customer.phones.mobile_phone.area_code,
      number: requestBody.customer.phones.mobile_phone.number,
      fullPhone: `+${requestBody.customer.phones.mobile_phone.country_code}${requestBody.customer.phones.mobile_phone.area_code}${requestBody.customer.phones.mobile_phone.number}`,
    } : 'N/A',
    phoneValid: !!(requestBody.customer.phones?.mobile_phone?.country_code && requestBody.customer.phones?.mobile_phone?.area_code && requestBody.customer.phones?.mobile_phone?.number),
    customerKeys: Object.keys(requestBody.customer),
  })

  // Log do request body completo (sem dados sensíveis)
  const requestBodyForLog = {
    ...requestBody,
    customer: {
      ...requestBody.customer,
      document: requestBody.customer.document ? `${requestBody.customer.document.substring(0, 3)}***` : undefined,
      phones: requestBody.customer.phones,
    },
  }
  console.log('[Pagar.me PIX] Request body completo (sem dados sensíveis):', JSON.stringify(requestBodyForLog, null, 2))

  // Log crítico: verificar se phone está realmente no requestBody antes de serializar
  console.log('[Pagar.me PIX] VERIFICAÇÃO CRÍTICA - requestBody.customer antes de enviar:', {
    hasCustomer: !!requestBody.customer,
    customerKeys: Object.keys(requestBody.customer),
    hasPhones: !!requestBody.customer.phones,
    hasMobilePhone: !!requestBody.customer.phones?.mobile_phone,
    phoneType: typeof requestBody.customer.phones?.mobile_phone,
    phoneIsObject: typeof requestBody.customer.phones?.mobile_phone === 'object' && !Array.isArray(requestBody.customer.phones?.mobile_phone),
    phoneValue: requestBody.customer.phones?.mobile_phone,
    phoneStringified: JSON.stringify(requestBody.customer.phones?.mobile_phone),
  })

  // Serializar e verificar novamente
  const requestBodyString = JSON.stringify(requestBody)
  const requestBodyParsed = JSON.parse(requestBodyString)
  console.log('[Pagar.me PIX] VERIFICAÇÃO PÓS-SERIALIZAÇÃO:', {
    hasCustomer: !!requestBodyParsed.customer,
    customerKeys: Object.keys(requestBodyParsed.customer || {}),
    hasPhones: !!requestBodyParsed.customer?.phones,
    hasMobilePhone: !!requestBodyParsed.customer?.phones?.mobile_phone,
    phoneType: typeof requestBodyParsed.customer?.phones?.mobile_phone,
    phoneValue: requestBodyParsed.customer?.phones?.mobile_phone,
  })

  // Log FINAL: verificar se phones está na string JSON que será enviada
  const phonesInString = requestBodyString.includes('"phones"')
  const mobilePhoneInString = requestBodyString.includes('"mobile_phone"')
  const phoneObjectInString = requestBodyString.includes('"country_code"') && requestBodyString.includes('"area_code"') && requestBodyString.includes('"number"')
  console.log('[Pagar.me PIX] VERIFICAÇÃO FINAL - String JSON que será enviada:', {
    phonesInString,
    mobilePhoneInString,
    phoneObjectInString,
    stringLength: requestBodyString.length,
    customerSection: requestBodyString.substring(
      requestBodyString.indexOf('"customer"'),
      requestBodyString.indexOf('"payments"') > 0 ? requestBodyString.indexOf('"payments"') : requestBodyString.length
    ),
  })

  const response = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: requestBodyString,
  })

  const responseText = await response.text()
  let errorData: any = null
  let data: any = null

  try {
    data = JSON.parse(responseText)
  } catch (e) {
    console.error('[Pagar.me PIX] Erro ao parsear resposta:', responseText)
    throw new Error('Resposta inválida da API Pagar.me')
  }

  if (!response.ok) {
    console.error('[Pagar.me PIX] Erro na API:', {
      status: response.status,
      statusText: response.statusText,
      error: data,
      errorMessage: data?.message || data?.error || data?.errors?.[0]?.message,
      errorDetails: data?.errors,
      requestBody: JSON.stringify(requestBodyForLog, null, 2),
    })
    
    // Log crítico: verificar se o phones estava no requestBody enviado
    console.error('[Pagar.me PIX] VERIFICAÇÃO DO REQUEST ENVIADO:', {
      requestBodyCustomer: requestBody.customer,
      requestBodyCustomerPhones: requestBody.customer.phones,
      requestBodyStringified: requestBodyString.substring(0, 500) + '...',
      requestBodyHasPhones: requestBodyString.includes('"phones"'),
      requestBodyHasMobilePhone: requestBodyString.includes('"mobile_phone"'),
    })
    
    // Log completo da resposta de erro
    console.error('[Pagar.me PIX] Resposta completa de erro:', JSON.stringify(data, null, 2))
    
    // Log detalhado dos erros
    if (data?.errors && Array.isArray(data.errors)) {
      console.error('[Pagar.me PIX] Erros detalhados do Pagar.me:')
      data.errors.forEach((err: any, index: number) => {
        console.error(`  Erro ${index + 1}:`, {
          message: err.message,
          parameter: err.parameter,
          type: err.type,
          fullError: err,
        })
      })
    }
    
    const errorMessage = data?.message || data?.error || data?.errors?.[0]?.message || 'Erro ao criar transação Pix'
    throw new Error(`Pagar.me: ${errorMessage}`)
  }

  console.log('[Pagar.me PIX] Resposta recebida:', {
    orderId: data.id,
    hasCharges: !!data.charges,
    chargesLength: data.charges?.length || 0,
    status: data.status,
    fullResponseKeys: Object.keys(data),
  })
  
  // Log da resposta completa para debug
  console.log('[Pagar.me PIX] Resposta completa do Pagar.me:', JSON.stringify(data, null, 2))
  
  // Buscar o pagamento Pix na resposta
  // A estrutura pode variar, tentar diferentes caminhos
  let pixPayment = null
  let qrCode = null
  
  if (data.charges && data.charges.length > 0) {
    const charge = data.charges[0]
    console.log('[Pagar.me PIX] Charge encontrado:', {
      chargeId: charge.id,
      status: charge.status,
      hasLastTransaction: !!charge.last_transaction,
      lastTransactionKeys: charge.last_transaction ? Object.keys(charge.last_transaction) : [],
    })
    pixPayment = charge.last_transaction
    
    // Tentar encontrar QR code em diferentes campos
    if (pixPayment) {
      qrCode = pixPayment.qr_code || pixPayment.qr_code_string || pixPayment.pix_qr_code || pixPayment.qr_code_base64
    }
  }
  
  // Fallback: tentar encontrar em outros lugares da resposta
  if (!pixPayment && data.last_transaction) {
    console.log('[Pagar.me PIX] Usando last_transaction direto')
    pixPayment = data.last_transaction
    qrCode = pixPayment.qr_code || pixPayment.qr_code_string || pixPayment.pix_qr_code || pixPayment.qr_code_base64
  }

  // Fallback adicional: procurar QR code diretamente na resposta
  if (!qrCode) {
    qrCode = data.qr_code || data.qr_code_string || data.pix_qr_code || data.qr_code_base64
    if (qrCode) {
      console.log('[Pagar.me PIX] QR Code encontrado diretamente na resposta')
    }
  }

  if (!pixPayment) {
    console.error('[Pagar.me PIX] Estrutura de resposta inesperada. Resposta completa:', JSON.stringify(data, null, 2))
    throw new Error('Resposta inválida do Pagar.me: estrutura de dados não encontrada. Verifique os logs para mais detalhes.')
  }

  console.log('[Pagar.me PIX] Dados do pagamento Pix:', {
    paymentId: pixPayment.id,
    status: pixPayment.status,
    hasQrCode: !!qrCode,
    qrCodeLength: qrCode?.length || 0,
    qrCodeField: qrCode ? (pixPayment.qr_code ? 'qr_code' : pixPayment.qr_code_string ? 'qr_code_string' : pixPayment.pix_qr_code ? 'pix_qr_code' : 'qr_code_base64') : 'não encontrado',
    expiresAt: pixPayment.expires_at,
    paymentKeys: Object.keys(pixPayment),
  })

  if (!qrCode) {
    console.error('[Pagar.me PIX] QR Code não encontrado na resposta. Dados do pagamento:', JSON.stringify(pixPayment, null, 2))
    console.error('[Pagar.me PIX] Resposta completa do Pagar.me:', JSON.stringify(data, null, 2))
    throw new Error('QR Code não foi gerado pelo Pagar.me. Verifique se o token está configurado corretamente para o ambiente.')
  }

  return {
    id: data.id,
    status: pixPayment.status || 'pending',
    amount: params.amount,
    payment_method: 'pix',
    pix_qr_code: qrCode,
    pix_expiration_date: pixPayment.expires_at,
    ...data,
  }
}

export async function createCreditCardTransaction(
  params: CreateTransactionParams,
  environment: IntegrationEnvironment = 'production'
): Promise<PagarmeTransaction> {
  if (!params.credit_card) {
    throw new Error('Dados do cartão são obrigatórios')
  }

  // Validar customer completo (mesmas validações do PIX)
  if (!params.customer) {
    throw new Error('Dados do cliente são obrigatórios')
  }
  
  if (!params.customer.name || params.customer.name.trim().length < 3) {
    throw new Error('Nome do cliente é obrigatório e deve ter pelo menos 3 caracteres')
  }
  
  if (!params.customer.email || !params.customer.email.includes('@')) {
    throw new Error('Email do cliente é obrigatório e deve ser válido')
  }
  
  if (!params.customer.document || params.customer.document.replace(/\D/g, '').length !== 11) {
    throw new Error('CPF do cliente é obrigatório e deve ser válido (11 dígitos)')
  }
  
  if (!params.customer.phone) {
    throw new Error('Telefone do cliente é obrigatório')
  }
  
  if (!params.customer.phone.country_code || !params.customer.phone.area_code || !params.customer.phone.number) {
    throw new Error('Telefone do cliente deve ter country_code, area_code e number')
  }
  
  if (params.customer.phone.country_code !== '55') {
    throw new Error('Código do país deve ser 55 (Brasil)')
  }
  
  if (params.customer.phone.area_code.length !== 2) {
    throw new Error('DDD (area_code) deve ter 2 dígitos')
  }
  
  if (params.customer.phone.number.length < 8 || params.customer.phone.number.length > 9) {
    throw new Error('Número de telefone deve ter 8 ou 9 dígitos')
  }

  // Validação final do phone antes de montar requestBody
  if (!params.customer.phone || !params.customer.phone.country_code || !params.customer.phone.area_code || !params.customer.phone.number) {
    throw new Error('Telefone do cliente é obrigatório e deve estar no formato {country_code, area_code, number}')
  }

  const apiKey = await getApiKey(environment)
  const baseUrl = getBaseUrl(environment)

  const cardField = params.credit_card.card_id
    ? { id: params.credit_card.card_id }
    : params.credit_card.card_token
    ? { token: params.credit_card.card_token }
    : undefined

  // Preparar itens com código
  const items = params.items && params.items.length > 0
    ? params.items.map(item => ({
        amount: Math.round(parseFloat(item.price.toString()) * 100 * parseInt(item.quantity.toString())),
        description: item.title,
        quantity: parseInt(item.quantity.toString()),
        code: item.product_id ? `prod-${item.product_id}` : `item-${item.id}`,
      }))
    : [{
        amount: params.amount,
        description: 'Pedido',
        quantity: 1,
        code: `order-${params.metadata?.order_id || 'unknown'}`,
      }]

  console.log('[Pagar.me Credit Card] Itens formatados para Pagar.me:', {
    itemsCount: items.length,
    items: items.map(item => ({
      code: item.code,
      description: item.description,
      quantity: item.quantity,
      amount: item.amount,
    })),
  })

  // Log de installments antes de montar requestBody
  console.log('[Pagar.me Credit Card] Installments recebido:', {
    installments: params.credit_card.installments,
    willUse: params.credit_card.installments || 1,
    installmentsType: typeof params.credit_card.installments,
    isValid: typeof params.credit_card.installments === 'number' && params.credit_card.installments >= 1 && params.credit_card.installments <= 12,
  })

  // Preparar request body com customer explícito (garantindo que phone está presente)
  // IMPORTANTE: Pagar.me espera "phones" (plural) como objeto com mobile_phone e/ou home_phone
  const customerPhone = {
    country_code: String(params.customer.phone.country_code),
    area_code: String(params.customer.phone.area_code),
    number: String(params.customer.phone.number),
  }

  // Preparar objeto billing para o pagamento de cartão, no formato { address: { ... } }
  // Depois ele será convertido para o formato v5 em credit_card.card.billing_address
  let billingForPayment:
    | {
        address: {
          street: string
          number: string
          complement: string
          neighborhood: string
          city: string
          state: string
          zip_code: string
          country: string
        }
      }
    | undefined

  if (params.billing?.address) {
    const address = params.billing.address
    billingForPayment = {
      address: {
        street: String(address.street || '').substring(0, 126),
        number: String(address.number || 'S/N'),
        complement: String(address.complement || ''),
        neighborhood: String(address.neighborhood || ''),
        city: String(address.city || ''),
        state: String(address.state || '').toUpperCase().substring(0, 2),
        zip_code: String(address.zip_code || '').replace(/\D/g, '').substring(0, 8),
        country: 'BR',
      },
    }

    // Log do billing antes de adicionar
    console.log('[Pagar.me Credit Card] Billing preparado para payment:', {
      hasBilling: !!billingForPayment,
      billing: billingForPayment,
      allFieldsPresent: !!(
        billingForPayment.address.street &&
        billingForPayment.address.city &&
        billingForPayment.address.state &&
        billingForPayment.address.zip_code
      ),
    })
  } else {
    console.log('[Pagar.me Credit Card] Billing não fornecido (payment será enviado sem billing)')
  }

  // Converter billingForPayment.address para o formato v5 (billing_address com line_1/line_2)
  const addr = billingForPayment?.address
  const billingAddress = addr
    ? {
        line_1: `${addr.street || ''}${addr.number ? ', ' + addr.number : ''}`.trim(),
        line_2: addr.complement || addr.neighborhood || '',
        zip_code: addr.zip_code,
        city: addr.city,
        state: addr.state,
        country: addr.country || 'BR',
      }
    : undefined

  const requestBody = {
    items,
    customer: {
      name: String(params.customer.name),
      email: String(params.customer.email),
      document: String(params.customer.document),
      type: String(params.customer.type || 'individual'),
      phones: {
        mobile_phone: customerPhone,
      },
    },
    payments: [
      {
        payment_method: 'credit_card',
        credit_card: {
          installments: params.credit_card.installments || 1,
          statement_descriptor: params.credit_card.statement_descriptor || 'PEDIDO',
          // v5: card_token explícito no nível de credit_card
          card_token: params.credit_card.card_token,
          // card pode conter outros dados (id/token) e o billing_address
          card: {
            ...(cardField || {}),
            ...(billingAddress ? { billing_address: billingAddress } : {}),
          },
        },
      },
    ],
    metadata: params.metadata || {},
  }
  
  // Verificação final crítica antes de enviar
  if (!requestBody.customer.phones || !requestBody.customer.phones.mobile_phone || !requestBody.customer.phones.mobile_phone.country_code || !requestBody.customer.phones.mobile_phone.area_code || !requestBody.customer.phones.mobile_phone.number) {
    console.error('[Pagar.me Credit Card] ERRO CRÍTICO: Phone não está presente no requestBody!', {
      requestBodyCustomer: requestBody.customer,
      paramsCustomerPhone: params.customer.phone,
    })
    throw new Error('Telefone do cliente não está presente no requestBody. Erro crítico na montagem dos dados.')
  }

  // Log detalhado do customer recebido
  console.log('[Pagar.me Credit Card] Customer recebido em params:', {
    name: params.customer?.name,
    email: params.customer?.email,
    hasDocument: !!params.customer?.document,
    documentPreview: params.customer?.document ? `${params.customer.document.substring(0, 3)}***` : 'N/A',
    type: params.customer?.type || 'individual',
    hasPhone: !!params.customer?.phone,
    phone: params.customer?.phone ? {
      country_code: params.customer.phone.country_code,
      area_code: params.customer.phone.area_code,
      number: params.customer.phone.number,
      fullPhone: `+${params.customer.phone.country_code}${params.customer.phone.area_code}${params.customer.phone.number}`,
    } : 'N/A',
    phoneValid: !!(params.customer?.phone?.country_code && params.customer?.phone?.area_code && params.customer?.phone?.number),
  })

  console.log('[Pagar.me Credit Card] Criando transação', {
    environment,
    amount: params.amount,
    hasCustomer: !!params.customer,
    customerName: params.customer?.name,
    customerDocument: params.customer?.document ? `${params.customer.document.substring(0, 3)}***` : 'N/A',
    customerPhone: params.customer?.phone ? `+${params.customer.phone.country_code} (${params.customer.phone.area_code}) ${params.customer.phone.number}` : 'N/A',
    hasBilling: !!params.billing,
    itemsCount: items.length,
    hasCardToken: !!cardField,
    installments: params.credit_card.installments || 1,
    baseUrl,
    apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'N/A',
  })

  // Log detalhado do requestBody.customer antes de enviar
  console.log('[Pagar.me Credit Card] RequestBody.customer completo antes de enviar:', {
    name: requestBody.customer.name,
    email: requestBody.customer.email,
    hasDocument: !!requestBody.customer.document,
    documentPreview: requestBody.customer.document ? `${requestBody.customer.document.substring(0, 3)}***` : 'N/A',
    type: requestBody.customer.type,
    hasPhones: !!requestBody.customer.phones,
    hasMobilePhone: !!requestBody.customer.phones?.mobile_phone,
    mobilePhone: requestBody.customer.phones?.mobile_phone ? {
      country_code: requestBody.customer.phones.mobile_phone.country_code,
      area_code: requestBody.customer.phones.mobile_phone.area_code,
      number: requestBody.customer.phones.mobile_phone.number,
      fullPhone: `+${requestBody.customer.phones.mobile_phone.country_code}${requestBody.customer.phones.mobile_phone.area_code}${requestBody.customer.phones.mobile_phone.number}`,
    } : 'N/A',
    phoneValid: !!(requestBody.customer.phones?.mobile_phone?.country_code && requestBody.customer.phones?.mobile_phone?.area_code && requestBody.customer.phones?.mobile_phone?.number),
    customerKeys: Object.keys(requestBody.customer),
  })

  // Log do request body completo (sem dados sensíveis)
  const requestBodyForLog = {
    ...requestBody,
    customer: {
      ...requestBody.customer,
      document: requestBody.customer.document ? `${requestBody.customer.document.substring(0, 3)}***` : undefined,
      phones: requestBody.customer.phones,
    },
    payments: requestBody.payments.map(payment => ({
      ...payment,
      credit_card: {
        ...payment.credit_card,
        card: payment.credit_card.card ? { ...payment.credit_card.card, token: payment.credit_card.card.token ? '***' : undefined } : undefined,
      },
    })),
  }
  console.log('[Pagar.me Credit Card] Request body completo (sem dados sensíveis):', JSON.stringify(requestBodyForLog, null, 2))

  // Log FINAL: JSON que será enviado para o Pagar.me (sem dados sensíveis)
  console.log(
    '[Pagar.me Credit Card] Request body FINAL (sem dados sensíveis):',
    JSON.stringify(requestBodyForLog, null, 2),
  )

  // Log crítico: verificar se phone está realmente no requestBody antes de serializar
  console.log('[Pagar.me Credit Card] VERIFICAÇÃO CRÍTICA - requestBody.customer antes de enviar:', {
    hasCustomer: !!requestBody.customer,
    customerKeys: Object.keys(requestBody.customer),
    hasPhones: !!requestBody.customer.phones,
    hasMobilePhone: !!requestBody.customer.phones?.mobile_phone,
    phoneType: typeof requestBody.customer.phones?.mobile_phone,
    phoneIsObject: typeof requestBody.customer.phones?.mobile_phone === 'object' && !Array.isArray(requestBody.customer.phones?.mobile_phone),
    phoneValue: requestBody.customer.phones?.mobile_phone,
    phoneStringified: JSON.stringify(requestBody.customer.phones?.mobile_phone),
  })

  // Serializar e verificar novamente
  const requestBodyString = JSON.stringify(requestBody)
  const requestBodyParsed = JSON.parse(requestBodyString)
  console.log('[Pagar.me Credit Card] VERIFICAÇÃO PÓS-SERIALIZAÇÃO:', {
    hasCustomer: !!requestBodyParsed.customer,
    customerKeys: Object.keys(requestBodyParsed.customer || {}),
    hasPhones: !!requestBodyParsed.customer?.phones,
    hasMobilePhone: !!requestBodyParsed.customer?.phones?.mobile_phone,
    phoneType: typeof requestBodyParsed.customer?.phones?.mobile_phone,
    phoneValue: requestBodyParsed.customer?.phones?.mobile_phone,
  })

  // Log FINAL: verificar se phones está na string JSON que será enviada
  const phonesInString = requestBodyString.includes('"phones"')
  const mobilePhoneInString = requestBodyString.includes('"mobile_phone"')
  const phoneObjectInString = requestBodyString.includes('"country_code"') && requestBodyString.includes('"area_code"') && requestBodyString.includes('"number"')
  console.log('[Pagar.me Credit Card] VERIFICAÇÃO FINAL - String JSON que será enviada:', {
    phonesInString,
    mobilePhoneInString,
    phoneObjectInString,
    stringLength: requestBodyString.length,
    customerSection: requestBodyString.substring(
      requestBodyString.indexOf('"customer"'),
      requestBodyString.indexOf('"payments"') > 0 ? requestBodyString.indexOf('"payments"') : requestBodyString.length
    ),
  })

  const response = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: requestBodyString,
  })

  const responseText = await response.text()
  let data: any = null
  let error: any = null

  try {
    data = JSON.parse(responseText)
  } catch (e) {
    console.error('[Pagar.me Credit Card] Erro ao parsear resposta:', responseText)
    throw new Error('Resposta inválida da API Pagar.me')
  }

  if (!response.ok) {
    error = data
    
    console.error('[Pagar.me Credit Card] Erro na API:', {
      status: response.status,
      statusText: response.statusText,
      error: error,
      errorMessage: error?.message || error?.error || error?.errors?.[0]?.message,
      errorDetails: error?.errors,
      requestBody: JSON.stringify(requestBodyForLog, null, 2),
    })
    
    // Log crítico: verificar se o phones estava no requestBody enviado
    console.error('[Pagar.me Credit Card] VERIFICAÇÃO DO REQUEST ENVIADO:', {
      requestBodyCustomer: requestBody.customer,
      requestBodyCustomerPhones: requestBody.customer.phones,
      requestBodyStringified: requestBodyString.substring(0, 500) + '...',
      requestBodyHasPhones: requestBodyString.includes('"phones"'),
      requestBodyHasMobilePhone: requestBodyString.includes('"mobile_phone"'),
    })
    
    // Log completo da resposta de erro
    console.error('[Pagar.me Credit Card] Resposta completa de erro:', JSON.stringify(error, null, 2))
    
    // Log detalhado dos erros
    if (error?.errors && Array.isArray(error.errors)) {
      console.error('[Pagar.me Credit Card] Erros detalhados do Pagar.me:')
      error.errors.forEach((err: any, index: number) => {
        console.error(`  Erro ${index + 1}:`, {
          message: err.message,
          parameter: err.parameter,
          type: err.type,
          fullError: err,
        })
      })
    }
    
    throw new Error(error.message || error.error || error.errors?.[0]?.message || 'Erro ao criar transação de cartão')
  }
  
  // Log da resposta completa mesmo quando OK (para debug de transações que falham)
  console.log('[Pagar.me Credit Card] Resposta completa do Pagar.me:', {
    orderId: data.id,
    status: data.status,
    hasCharges: !!data.charges,
    chargesLength: data.charges?.length || 0,
    charges: data.charges?.map((charge: any) => ({
      id: charge.id,
      status: charge.status,
      lastTransaction: charge.last_transaction ? {
        id: charge.last_transaction.id,
        status: charge.last_transaction.status,
        gatewayResponse: charge.last_transaction.gateway_response,
        acquirerResponse: charge.last_transaction.acquirer_response,
        acquirerResponseCode: charge.last_transaction.acquirer_response_code,
        acquirerResponseMessage: charge.last_transaction.acquirer_response_message,
      } : null,
    })) || [],
  })
  
  // Buscar o pagamento de cartão na resposta
  const cardPayment = data.charges?.[0]?.last_transaction
  if (!cardPayment) {
    console.error('[Pagar.me Credit Card] Resposta inválida - last_transaction não encontrado. Resposta completa:', JSON.stringify(data, null, 2))
    throw new Error('Resposta inválida do Pagar.me')
  }
  
  // Log detalhado do pagamento
  console.log('[Pagar.me Credit Card] Dados do pagamento:', {
    paymentId: cardPayment.id,
    status: cardPayment.status,
    gatewayResponse: cardPayment.gateway_response,
    acquirerResponse: cardPayment.acquirer_response,
    acquirerResponseCode: cardPayment.acquirer_response_code,
    acquirerResponseMessage: cardPayment.acquirer_response_message,
    gatewayId: cardPayment.gateway_id,
    paymentKeys: Object.keys(cardPayment),
  })
  
  // Se a transação falhou, logar os detalhes do erro
  if (cardPayment.status === 'failed' || data.status === 'failed') {
    console.error('[Pagar.me Credit Card] TRANSAÇÃO FALHOU - Detalhes completos:', {
      orderStatus: data.status,
      chargeStatus: data.charges?.[0]?.status,
      transactionStatus: cardPayment.status,
      gatewayResponse: cardPayment.gateway_response,
      acquirerResponse: cardPayment.acquirer_response,
      acquirerResponseCode: cardPayment.acquirer_response_code,
      acquirerResponseMessage: cardPayment.acquirer_response_message,
      fullResponse: JSON.stringify(data, null, 2),
    })
  }

  return {
    id: data.id,
    status: cardPayment.status || 'pending',
    amount: params.amount,
    payment_method: 'credit_card',
    ...data,
  }
}

export async function getTransaction(
  transactionId: string,
  environment: IntegrationEnvironment = 'production'
): Promise<PagarmeTransaction> {
  const apiKey = await getApiKey(environment)
  const baseUrl = getBaseUrl(environment)

  const response = await fetch(`${baseUrl}/orders/${transactionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Erro ao buscar transação')
  }

  return response.json()
}

// Função para validar token do Pagar.me
export async function validateToken(
  apiKey: string,
  environment: IntegrationEnvironment = 'production'
): Promise<{ valid: boolean; message: string; details?: any }> {
  try {
    const baseUrl = getBaseUrl(environment)
    // Tenta fazer uma chamada simples para validar o token
    // Usamos o endpoint de listar pedidos com limite mínimo
    const response = await fetch(`${baseUrl}/orders?size=1`, {
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
