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
    holder_document?: string // CPF/CNPJ do titular do cartão
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

/**
 * Extrai mensagem de erro do gateway_response da transação Pagar.me
 */
function extractGatewayError(pixPayment: any): string | null {
  if (pixPayment?.gateway_response?.errors && Array.isArray(pixPayment.gateway_response.errors) && pixPayment.gateway_response.errors.length > 0) {
    return pixPayment.gateway_response.errors[0].message
  }
  if (pixPayment?.gateway_response?.code) {
    return `Erro ${pixPayment.gateway_response.code}`
  }
  return null
}

export async function createPixTransaction(
  params: CreateTransactionParams,
  environment: IntegrationEnvironment = 'production'
): Promise<PagarmeTransaction> {
  const apiKey = await getApiKey(environment)
  const baseUrl = getBaseUrl(environment)

  // Verificar se apiKey está presente (validação de token)
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(`Token do Pagar.me não configurado para ambiente ${environment}`)
  }

  // Log em desenvolvimento para verificar qual chave está sendo usada (mascarada)
  if (process.env.NODE_ENV === 'development') {
    const maskedKey = apiKey.length > 8 
      ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
      : '****'
    console.log('[Pagar.me PIX] Usando API key:', {
      environment,
      keyPreview: maskedKey,
      keyLength: apiKey.length,
    })
  }

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
  // IMPORTANTE: Quando há items, o Pagar.me ignora o amount no nível raiz e usa apenas a soma dos items.
  // Portanto, precisamos incluir o frete como um item adicional se houver diferença entre o total e a soma dos produtos.
  let items: Array<{
    amount: number
    description: string
    quantity: number
    code: string
  }> = []

  if (params.items && params.items.length > 0) {
    // Mapear items dos produtos
    // IMPORTANTE: O Pagar.me espera amount como valor UNITÁRIO em centavos e multiplica automaticamente por quantity
    items = params.items.map(item => ({
      amount: Math.round(parseFloat(item.price.toString()) * 100), // Valor unitário apenas, sem multiplicar por quantity
      description: item.title,
      quantity: parseInt(item.quantity.toString()),
      code: item.product_id ? `prod-${item.product_id}` : `item-${item.id}`,
    }))

    // Calcular soma dos items dos produtos
    // Como amount agora é unitário, precisamos multiplicar por quantity para obter o total
    const itemsTotal = items.reduce((sum, item) => sum + (item.amount * item.quantity), 0)
    const totalAmount = params.amount

    // Se houver diferença entre o total e a soma dos items, adicionar frete como item
    const difference = totalAmount - itemsTotal
    if (difference > 0) {
      // Adicionar frete como item adicional
      items.push({
        amount: difference,
        description: 'Frete',
        quantity: 1,
        code: `shipping-${params.metadata?.order_id || 'unknown'}`,
      })
    } else if (difference < 0) {
      // Se a diferença for negativa, há um problema de cálculo
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Pagar.me PIX] Diferença negativa entre total e items:', {
          totalAmount,
          itemsTotal,
          difference,
        })
      }
    }
  } else {
    // Sem items específicos, criar item único com o total
    items = [{
      amount: params.amount,
      description: 'Pedido',
      quantity: 1,
      code: `order-${params.metadata?.order_id || 'unknown'}`,
    }]
  }

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

  // Sempre incluir metadata (mesmo que vazio) para consistência com cartão
  // Isso garante que a estrutura seja idêntica e pode resolver problemas de "ambiente não configurado"
  requestBody.metadata = params.metadata || {}

  const requestBodyString = JSON.stringify(requestBody)

  // Log do requestBody em desenvolvimento para facilitar debug e comparação com cartão
  if (process.env.NODE_ENV === 'development') {
    console.log('[Pagar.me PIX] Request body completo:', JSON.stringify(requestBody, null, 2))
  }

  // Construir header Authorization (mesmo formato usado em createCreditCardTransaction)
  const authHeader = `Basic ${Buffer.from(apiKey + ':').toString('base64')}`

  // Log em desenvolvimento para comparar headers
  if (process.env.NODE_ENV === 'development') {
    console.log('[Pagar.me PIX] Headers de autenticação:', {
      hasAuthHeader: !!authHeader,
      authHeaderLength: authHeader.length,
      baseUrl,
    })
  }

  const response = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
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
    // Tratamento de erro específico baseado no status HTTP
    let errorMessage = 'Erro ao criar transação Pix'
    
    if (response.status === 401) {
      errorMessage = 'Token do Pagar.me inválido ou não autorizado. Verifique se a secret_key está configurada corretamente no banco de dados.'
    } else if (response.status === 400) {
      errorMessage = data?.message || data?.error || data?.errors?.[0]?.message || 'Dados inválidos enviados ao Pagar.me'
    } else if (response.status === 404) {
      errorMessage = 'Endpoint do Pagar.me não encontrado. Verifique a configuração do ambiente.'
    } else if (response.status >= 500) {
      errorMessage = 'Erro interno no servidor do Pagar.me. Tente novamente mais tarde.'
    } else {
      errorMessage = data?.message || data?.error || data?.errors?.[0]?.message || 'Erro ao criar transação Pix'
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('[Pagar.me PIX] Erro na API:', {
        status: response.status,
        statusText: response.statusText,
        errorMessage,
        errors: data?.errors,
        responseData: data,
      })
    }
    throw new Error(`Pagar.me: ${errorMessage}`)
  }

  // Buscar o pagamento Pix na resposta com verificações mais robustas
  let pixPayment = null
  let qrCode = null
  
  // Verificar estrutura básica da resposta
  if (!data || typeof data !== 'object') {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Pagar.me PIX] Resposta não é um objeto válido:', typeof data, data)
    }
    throw new Error('Resposta inválida do Pagar.me: formato de dados incorreto.')
  }

  // Tentar buscar em data.charges[0].last_transaction (estrutura mais comum)
  if (data.charges && Array.isArray(data.charges) && data.charges.length > 0) {
    const firstCharge = data.charges[0]
    if (firstCharge && firstCharge.last_transaction) {
      pixPayment = firstCharge.last_transaction
      // Buscar QR code em todos os campos possíveis
      qrCode = pixPayment.qr_code 
        || pixPayment.qr_code_string 
        || pixPayment.pix_qr_code 
        || pixPayment.qr_code_base64
        || pixPayment.qr_code_url
    }
  }
  
  // Fallback: tentar em data.last_transaction
  if (!pixPayment && data.last_transaction) {
    pixPayment = data.last_transaction
    qrCode = qrCode || pixPayment.qr_code 
      || pixPayment.qr_code_string 
      || pixPayment.pix_qr_code 
      || pixPayment.qr_code_base64
      || pixPayment.qr_code_url
  }

  // Fallback: tentar buscar QR code diretamente no nível raiz
  if (!qrCode) {
    qrCode = data.qr_code 
      || data.qr_code_string 
      || data.pix_qr_code 
      || data.qr_code_base64
      || data.qr_code_url
  }

  // Fallback adicional: buscar em data.charges[0].payment_method (se existir)
  if (!qrCode && data.charges && Array.isArray(data.charges) && data.charges.length > 0) {
    const charge = data.charges[0]
    if (charge && charge.payment_method && charge.payment_method.pix) {
      const pixData = charge.payment_method.pix
      qrCode = pixData.qr_code 
        || pixData.qr_code_string 
        || pixData.pix_qr_code 
        || pixData.qr_code_base64
        || pixData.qr_code_url
      if (!pixPayment && pixData) {
        pixPayment = pixData
      }
    }
  }

  // Verificar se encontramos o pagamento
  if (!pixPayment) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Pagar.me PIX] Estrutura de resposta inesperada - pixPayment não encontrado:', {
        hasCharges: !!data.charges,
        chargesLength: data.charges?.length || 0,
        hasLastTransaction: !!data.last_transaction,
        dataKeys: Object.keys(data),
        fullResponse: JSON.stringify(data, null, 2),
      })
    }
    throw new Error('Resposta inválida do Pagar.me: estrutura de dados de pagamento não encontrada. Verifique se o método de pagamento PIX está habilitado na sua conta Pagar.me.')
  }

  // Verificar status da transação antes de buscar QR code
  // Se a transação falhou, extrair erro do gateway_response
  const transactionStatus = pixPayment.status || data.status || data.charges?.[0]?.status
  const transactionSuccess = pixPayment.success !== undefined ? pixPayment.success : (transactionStatus !== 'failed')
  
  if (transactionStatus === 'failed' || transactionSuccess === false) {
    const gatewayError = extractGatewayError(pixPayment)
    
    if (process.env.NODE_ENV === 'development') {
      console.error('[Pagar.me PIX] Transação falhou:', {
        status: transactionStatus,
        success: transactionSuccess,
        gatewayError,
        gatewayResponse: pixPayment.gateway_response,
      })
    }
    
    // Mensagem específica para erro de Company não encontrada
    if (gatewayError && (gatewayError.includes('Company') || gatewayError.includes('company'))) {
      throw new Error('Conta Pagar.me não configurada corretamente. Verifique se a Company está configurada na sua conta Pagar.me e se o token está associado à Company correta.')
    }
    
    // Mensagem específica para outros erros do gateway
    if (gatewayError) {
      // Limpar mensagem de erro removendo prefixos desnecessários
      let cleanError = gatewayError
      if (cleanError.includes('|')) {
        const parts = cleanError.split('|')
        cleanError = parts[parts.length - 1].trim() || cleanError
      }
      throw new Error(`Transação PIX falhou: ${cleanError}`)
    }
    
    // Mensagem genérica se não conseguir extrair erro específico
    throw new Error('Transação PIX falhou. Verifique a configuração da sua conta Pagar.me e tente novamente.')
  }

  // Verificar se encontramos o QR code (apenas se transação não falhou)
  if (!qrCode) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Pagar.me PIX] QR Code não encontrado na resposta:', {
        pixPaymentKeys: pixPayment ? Object.keys(pixPayment) : [],
        dataKeys: Object.keys(data),
        hasCharges: !!data.charges,
        chargeKeys: data.charges?.[0] ? Object.keys(data.charges[0]) : [],
        transactionStatus,
        transactionSuccess,
        fullResponse: JSON.stringify(data, null, 2),
      })
    }
    throw new Error('QR Code não foi gerado pelo Pagar.me. Verifique se o token está configurado corretamente para o ambiente e se a conta Pagar.me tem PIX habilitado.')
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

  // Verificar se apiKey está presente (validação de token) - mesma validação do PIX
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(`Token do Pagar.me não configurado para ambiente ${environment}`)
  }

  // Log em desenvolvimento para verificar qual chave está sendo usada (mascarada)
  if (process.env.NODE_ENV === 'development') {
    const maskedKey = apiKey.length > 8 
      ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
      : '****'
    console.log('[Pagar.me Credit Card] Usando API key:', {
      environment,
      keyPreview: maskedKey,
      keyLength: apiKey.length,
    })
  }

  const cardField = params.credit_card.card_id
    ? { id: params.credit_card.card_id }
    : params.credit_card.card_token
    ? { token: params.credit_card.card_token }
    : undefined

  // Preparar itens com código
  // IMPORTANTE: Quando há items, o Pagar.me ignora o amount no nível raiz e usa apenas a soma dos items.
  // Portanto, precisamos incluir o frete como um item adicional se houver diferença entre o total e a soma dos produtos.
  let items: Array<{
    amount: number
    description: string
    quantity: number
    code: string
  }> = []

  if (params.items && params.items.length > 0) {
    // Mapear items dos produtos
    // IMPORTANTE: O Pagar.me espera amount como valor UNITÁRIO em centavos e multiplica automaticamente por quantity
    items = params.items.map(item => ({
      amount: Math.round(parseFloat(item.price.toString()) * 100), // Valor unitário apenas, sem multiplicar por quantity
      description: item.title,
      quantity: parseInt(item.quantity.toString()),
      code: item.product_id ? `prod-${item.product_id}` : `item-${item.id}`,
    }))

    // Calcular soma dos items dos produtos
    // Como amount agora é unitário, precisamos multiplicar por quantity para obter o total
    const itemsTotal = items.reduce((sum, item) => sum + (item.amount * item.quantity), 0)
    const totalAmount = params.amount

    // Se houver diferença entre o total e a soma dos items, adicionar frete como item
    const difference = totalAmount - itemsTotal
    if (difference > 0) {
      // Adicionar frete como item adicional
      items.push({
        amount: difference,
        description: 'Frete',
        quantity: 1,
        code: `shipping-${params.metadata?.order_id || 'unknown'}`,
      })
    } else if (difference < 0) {
      // Se a diferença for negativa, há um problema de cálculo
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Pagar.me Credit Card] Diferença negativa entre total e items:', {
          totalAmount,
          itemsTotal,
          difference,
        })
      }
    }
  } else {
    // Sem items específicos, criar item único com o total
    items = [{
      amount: params.amount,
      description: 'Pedido',
      quantity: 1,
      code: `order-${params.metadata?.order_id || 'unknown'}`,
    }]
  }

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
          // card pode conter outros dados (id/token), billing_address e holder_document
          card: {
            ...(cardField || {}),
            ...(billingAddress ? { billing_address: billingAddress } : {}),
            ...(params.credit_card.holder_document ? { holder_document: params.credit_card.holder_document } : {}),
          },
        },
      },
    ],
    metadata: params.metadata || {},
  }
  
  // Verificação final crítica antes de enviar
  if (!requestBody.customer.phones || !requestBody.customer.phones.mobile_phone || !requestBody.customer.phones.mobile_phone.country_code || !requestBody.customer.phones.mobile_phone.area_code || !requestBody.customer.phones.mobile_phone.number) {
    throw new Error('Telefone do cliente não está presente no requestBody. Erro crítico na montagem dos dados.')
  }

  const requestBodyString = JSON.stringify(requestBody)

  // Construir header Authorization (mesmo formato usado em createPixTransaction)
  const authHeader = `Basic ${Buffer.from(apiKey + ':').toString('base64')}`

  // Log em desenvolvimento para comparar headers
  if (process.env.NODE_ENV === 'development') {
    console.log('[Pagar.me Credit Card] Headers de autenticação:', {
      hasAuthHeader: !!authHeader,
      authHeaderLength: authHeader.length,
      baseUrl,
    })
  }

  const response = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
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
    const errorMessage = error?.message || error?.error || error?.errors?.[0]?.message || 'Erro ao criar transação de cartão'
    if (process.env.NODE_ENV === 'development') {
      console.error('[Pagar.me Credit Card] Erro na API:', {
        status: response.status,
        errorMessage,
        errors: error?.errors,
      })
    }
    throw new Error(errorMessage)
  }
  
  // Buscar o pagamento de cartão na resposta
  const cardPayment = data.charges?.[0]?.last_transaction
  if (!cardPayment) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Pagar.me Credit Card] Resposta inválida - last_transaction não encontrado')
    }
    throw new Error('Resposta inválida do Pagar.me')
  }
  
  // Se a transação falhou, logar os detalhes do erro apenas em desenvolvimento
  if ((cardPayment.status === 'failed' || data.status === 'failed') && process.env.NODE_ENV === 'development') {
    console.error('[Pagar.me Credit Card] Transação falhou:', {
      status: cardPayment.status,
      acquirerResponseCode: cardPayment.acquirer_response_code,
      acquirerResponseMessage: cardPayment.acquirer_response_message,
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
