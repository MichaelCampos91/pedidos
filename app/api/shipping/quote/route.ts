import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { calculateShipping } from '@/lib/melhor-envio'
import { getToken, updateTokenValidation, type IntegrationEnvironment } from '@/lib/integrations'
import { generateCacheKey, getCachedQuote, setCachedQuote, cleanupExpiredCache } from '@/lib/shipping-cache'
import { applyShippingRules } from '@/lib/shipping-rules'

// Limpar cache expirado periodicamente
cleanupExpiredCache()

// Validações de dimensões conforme regras do Melhor Envio
const DIMENSIONS_MIN = { width: 2, height: 11, length: 16 } // cm
const DIMENSIONS_MAX = { width: 105, height: 105, length: 105 } // cm
const WEIGHT_MIN = 0.1 // kg
const WEIGHT_MAX = 30 // kg (varia por transportadora, mas 30kg é um limite geral)
const CUBIC_WEIGHT_FACTOR = 300 // fator de cubagem padrão (kg/m³)

function validateDimensions(width: number, height: number, length: number, weight: number): { valid: boolean; error?: string } {
  // Validar dimensões mínimas
  if (width < DIMENSIONS_MIN.width || height < DIMENSIONS_MIN.height || length < DIMENSIONS_MIN.length) {
    return {
      valid: false,
      error: `Dimensões muito pequenas. Mínimo: ${DIMENSIONS_MIN.width}cm x ${DIMENSIONS_MIN.height}cm x ${DIMENSIONS_MIN.length}cm`
    }
  }

  // Validar dimensões máximas
  if (width > DIMENSIONS_MAX.width || height > DIMENSIONS_MAX.height || length > DIMENSIONS_MAX.length) {
    return {
      valid: false,
      error: `Dimensões muito grandes. Máximo: ${DIMENSIONS_MAX.width}cm x ${DIMENSIONS_MAX.height}cm x ${DIMENSIONS_MAX.length}cm`
    }
  }

  // Validar peso
  if (weight < WEIGHT_MIN) {
    return {
      valid: false,
      error: `Peso muito baixo. Mínimo: ${WEIGHT_MIN}kg`
    }
  }

  if (weight > WEIGHT_MAX) {
    return {
      valid: false,
      error: `Peso muito alto. Máximo: ${WEIGHT_MAX}kg`
    }
  }

  // Validar cubicagem (peso cubado)
  const volume = (width * height * length) / 1000000 // converter para m³
  const cubicWeight = volume * CUBIC_WEIGHT_FACTOR
  
  if (cubicWeight > WEIGHT_MAX) {
    return {
      valid: false,
      error: `Peso cubado muito alto (${cubicWeight.toFixed(2)}kg). Ajuste as dimensões.`
    }
  }

  return { valid: true }
}

async function getCepOrigem(environment: IntegrationEnvironment): Promise<string> {
  // Tentar obter do token (additional_data)
  try {
    const token = await getToken('melhor_envio', environment)
    if (token?.additional_data?.cep_origem) {
      return token.additional_data.cep_origem
    }
  } catch (error) {
    console.warn('[Shipping Quote] Erro ao buscar CEP origem do token:', error)
  }

  // Fallback para variáveis de ambiente
  const envKey = environment === 'sandbox' 
    ? 'MELHOR_ENVIO_CEP_ORIGEM_SANDBOX' 
    : 'MELHOR_ENVIO_CEP_ORIGEM'
  
  return process.env[envKey] || process.env.MELHOR_ENVIO_CEP_ORIGEM || '16010000'
}

export async function POST(request: NextRequest) {
  // Determinar environment no início para estar disponível no catch
  let environment: IntegrationEnvironment = 'production'
  
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value

    // Autenticação
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { cep_destino, peso, altura, largura, comprimento, valor, produtos, order_value, destination_state } = body

    // Determinar environment: usar do body se fornecido, senão buscar ambiente ativo
    if (body.environment === 'sandbox' || body.environment === 'production') {
      environment = body.environment as IntegrationEnvironment
    } else {
      // Buscar ambiente ativo configurado
      try {
        const { getActiveEnvironment } = await import('@/lib/settings')
        const activeEnv = await getActiveEnvironment('melhor_envio')
        if (activeEnv) {
          environment = activeEnv
        } else {
          // Fallback: verificar qual token existe
          const { getToken } = await import('@/lib/integrations')
          const productionToken = await getToken('melhor_envio', 'production')
          const sandboxToken = await getToken('melhor_envio', 'sandbox')
          
          if (productionToken) environment = 'production'
          else if (sandboxToken) environment = 'sandbox'
          // Caso contrário, mantém 'production' como padrão
        }
      } catch (error) {
        console.warn('[Shipping Quote] Erro ao buscar ambiente ativo, usando produção como padrão:', error)
        environment = 'production'
      }
    }

    if (!cep_destino) {
      return NextResponse.json(
        { error: 'CEP de destino é obrigatório' },
        { status: 400 }
      )
    }

    const cleanCepDestino = cep_destino.replace(/\D/g, '')

    if (cleanCepDestino.length !== 8) {
      return NextResponse.json(
        { error: 'CEP inválido. O CEP deve ter 8 dígitos.' },
        { status: 400 }
      )
    }
    const cepOrigemRaw = await getCepOrigem(environment)
    const cleanCepOrigem = cepOrigemRaw.replace(/\D/g, '')

    if (cleanCepOrigem.length !== 8) {
      return NextResponse.json(
        { error: 'CEP de origem inválido. Configure o CEP de origem na página de Integrações.' },
        { status: 400 }
      )
    }

    // Processar produtos (suporta array ou valores únicos para compatibilidade)
    let productsList: Array<{ id: string; width: number; height: number; length: number; weight: number; insurance_value: number; quantity: number }>
    
    if (produtos && Array.isArray(produtos) && produtos.length > 0) {
      // Validar cada produto
      for (const produto of produtos) {
        const validation = validateDimensions(
          produto.largura || produto.width || 20,
          produto.altura || produto.height || 10,
          produto.comprimento || produto.length || 30,
          produto.peso || produto.weight || 0.3
        )
        
        if (!validation.valid) {
          return NextResponse.json(
            { error: `Produto ${produto.id || 'desconhecido'}: ${validation.error}` },
            { status: 400 }
          )
        }
      }
      
      productsList = produtos.map((p: any, index: number) => ({
        id: p.id || `produto-${index + 1}`,
        width: p.largura || p.width || 20,
        height: p.altura || p.height || 10,
        length: p.comprimento || p.length || 30,
        weight: p.peso || p.weight || 0.3,
        insurance_value: p.valor || p.insurance_value || p.valor_seguro || 100,
        quantity: p.quantidade || p.quantity || 1,
      }))
    } else {
      // Modo legacy: valores únicos
      const weight = Number(peso) || 0.3
      const height = Number(altura) || 10
      const width = Number(largura) || 20
      const length = Number(comprimento) || 30
      const insuranceValue = Number(valor) || 100

      // Validar dimensões
      const validation = validateDimensions(width, height, length, weight)
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        )
      }

      productsList = [{
        id: '1',
        width,
        height,
        length,
        weight,
        insurance_value: insuranceValue,
        quantity: 1,
      }]
    }

    // Verificar cache
    const cacheKey = generateCacheKey(cleanCepDestino, productsList, environment)
    const cachedOptions = getCachedQuote(cacheKey)
    
    if (cachedOptions) {
      console.log('[Shipping Quote] Retornando do cache', { cacheKey })
      return NextResponse.json({
        success: true,
        options: cachedOptions,
        cached: true,
      })
    }

    console.log('[Shipping Quote] Ambiente selecionado:', environment)

    // Chamar API do Melhor Envio
    const shippingOptions = await calculateShipping({
      from: {
        postal_code: cleanCepOrigem,
      },
      to: {
        postal_code: cleanCepDestino,
      },
      products: productsList,
    }, environment)

    // Filtrar opções com preço inválido ou undefined
    const validOptions = (shippingOptions || []).filter(option => {
      if (!option || !option.price) return false
      const price = parseFloat(option.price)
      return !isNaN(price) && isFinite(price) && price > 0
    })

    console.log('[Shipping Quote] Opções filtradas', {
      total: shippingOptions?.length || 0,
      validas: validOptions.length,
      invalidas: (shippingOptions?.length || 0) - validOptions.length,
    })

    // Tratar resposta vazia
    if (!validOptions || validOptions.length === 0) {
      return NextResponse.json({
        success: true,
        options: [],
        message: '[Melhor Envio] Nenhum serviço de entrega disponível para este CEP e dimensões. Tente outro endereço ou ajuste as dimensões do produto.',
        source: 'integration',
      })
    }

    // Aplicar regras de frete
    try {
      const orderValue = order_value || (produtos && produtos.length > 0
        ? produtos.reduce((sum: number, p: any) => sum + (parseFloat(p.valor || p.insurance_value || 0) * parseInt(p.quantidade || p.quantity || 1)), 0)
        : parseFloat(valor || 0))

      const result = await applyShippingRules({
        shippingOptions: validOptions,
        orderValue,
        destinationState: destination_state,
        destinationCep: cleanCepDestino,
      })

      // Armazenar no cache apenas opções válidas (após aplicar regras)
      setCachedQuote(cacheKey, result.options)

      return NextResponse.json({
        success: true,
        options: result.options,
        cached: false,
        productionDaysAdded: result.productionDaysAdded,
        appliedRules: result.appliedRules,
      })
    } catch (rulesError: any) {
      // Se houver erro ao aplicar regras, retornar opções originais
      console.error('[Shipping Quote] Erro ao aplicar regras de frete:', rulesError)
      
      // Armazenar no cache apenas opções válidas
      setCachedQuote(cacheKey, validOptions)

      return NextResponse.json({
        success: true,
        options: validOptions,
        cached: false,
      })
    }
  } catch (error: any) {
    console.error('[Shipping Quote] Erro:', {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name,
    })

    // Erro de autenticação JWT
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }

    // Erro de token não configurado
    if (error.message.includes('não configurado') || error.message.includes('está vazia')) {
      return NextResponse.json({
        error: '[Sistema] ' + error.message,
        details: 'Configure o token na página de Integrações antes de fazer cotações.',
        source: 'system',
      }, { status: 500 })
    }

    // Se for erro 401/403 (mas não missing_scope), atualizar status do token no banco
    // missing_scope não marca como inválido porque o token é válido, só não tem permissão
    if ((error.message.includes('401') || error.message.includes('403') || error.message.includes('inválido') || error.message.includes('expirado')) 
        && !error.message.includes('sem permissões') && !error.message.includes('missing_scope')) {
      try {
        const token = await getToken('melhor_envio', environment)
        if (token) {
          await updateTokenValidation(
            token.id,
            'invalid',
            error.message,
            { lastError: new Date().toISOString(), endpoint: 'calculate' }
          )
          console.log('[Shipping Quote] Status do token atualizado para inválido após erro 401/403')
        }
      } catch (updateError) {
        console.error('[Shipping Quote] Erro ao atualizar status do token:', updateError)
      }
    }

    // Tratar erros específicos com mensagens amigáveis e prefixos
    let errorMessage = error.message || 'Erro ao calcular frete'
    let userFriendlyMessage = errorMessage
    let statusCode = 500
    let errorSource: 'system' | 'integration' = 'system'

    // Erro 422 - Validação (da integração)
    if (error.message.includes('422') || error.message.includes('Dados inválidos')) {
      userFriendlyMessage = '[Melhor Envio] Dados inválidos para cotação. Verifique o CEP, dimensões e peso dos produtos.'
      statusCode = 422
      errorSource = 'integration'
    }
    
    // Erro de permissão/escopo (da integração)
    else if (error.message.includes('sem permissões') || error.message.includes('missing_scope') || error.message.includes('permissões necessárias')) {
      userFriendlyMessage = error.message // Usar mensagem completa do diagnóstico que já inclui sugestão
      statusCode = 403
      errorSource = 'integration'
    }
    
    // Erro 401/403 - Token (da integração)
    else if (error.message.includes('401') || error.message.includes('403') || error.message.includes('inválido') || error.message.includes('expirado') || error.message.includes('unauthorized')) {
      userFriendlyMessage = error.message.includes('diagnóstico') || error.message.includes('sugestão') 
        ? error.message // Se já tem diagnóstico detalhado, usar a mensagem completa
        : '[Melhor Envio] Erro de autenticação. O token pode ter expirado. Tente novamente em alguns instantes ou verifique a configuração na página de Integrações.'
      statusCode = error.message.includes('403') ? 403 : 401
      errorSource = 'integration'
    }
    
    // Erro de rede/timeout (sistema)
    else if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('timeout')) {
      userFriendlyMessage = '[Sistema] Erro de conexão com o serviço de frete. Tente novamente em alguns instantes.'
      statusCode = 503
      errorSource = 'system'
    }
    
    // Erro de token não configurado (sistema)
    else if (error.message.includes('não configurado') || error.message.includes('está vazia')) {
      userFriendlyMessage = '[Sistema] ' + errorMessage
      errorSource = 'system'
    }
    
    // Erro genérico (sistema)
    else {
      userFriendlyMessage = '[Sistema] Não foi possível calcular o frete no momento. Tente novamente ou entre em contato com o suporte.'
      errorSource = 'system'
    }

    return NextResponse.json({
      error: userFriendlyMessage,
      details: errorMessage,
      source: errorSource,
      retryable: statusCode === 503 || statusCode === 401 || (statusCode === 403 && !errorMessage.includes('sem permissões')),
    }, { status: statusCode })
  }
}
