import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { query } from '@/lib/database'
import { calculateShipping } from '@/lib/melhor-envio'
import { getToken, type IntegrationEnvironment } from '@/lib/integrations'
import { getProductionDays, addProductionDaysToOptions, applyShippingRules } from '@/lib/shipping-rules'

// Marca a rota como dinâmica porque usa cookies para autenticação
export const dynamic = 'force-dynamic'

async function getCepOrigem(environment: IntegrationEnvironment): Promise<string> {
  try {
    const token = await getToken('melhor_envio', environment)
    if (token?.additional_data?.cep_origem) {
      return token.additional_data.cep_origem
    }
  } catch (error) {
    console.warn('[Shipping Quotes Refresh] Erro ao buscar CEP origem do token:', error)
  }

  const envKey = environment === 'sandbox'
    ? 'MELHOR_ENVIO_CEP_ORIGEM_SANDBOX'
    : 'MELHOR_ENVIO_CEP_ORIGEM'

  return process.env[envKey] || process.env.MELHOR_ENVIO_CEP_ORIGEM || '16010000'
}

// Busca detalhe de uma cotação salva
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const quoteResult = await query(
      'SELECT * FROM shipping_quotes WHERE id = $1',
      [params.id]
    )

    if (quoteResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Cotação não encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json(quoteResult.rows[0])
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Shipping Quotes API] Erro ao buscar cotação:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar cotação' },
      { status: 500 }
    )
  }
}

// Refaz a cotação com base nos dados salvos e atualiza o registro
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let environment: IntegrationEnvironment = 'production'

  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const quoteResult = await query(
      'SELECT * FROM shipping_quotes WHERE id = $1',
      [params.id]
    )

    if (quoteResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Cotação não encontrada' },
        { status: 404 }
      )
    }

    const quote = quoteResult.rows[0]

    // Determinar environment salvo na cotação
    environment = (quote.environment as IntegrationEnvironment) || 'production'

    const cleanCepDestino = String(quote.cep_destino || '').replace(/\D/g, '')
    if (!cleanCepDestino || cleanCepDestino.length !== 8) {
      return NextResponse.json(
        { error: 'CEP de destino inválido na cotação salva' },
        { status: 400 }
      )
    }

    const cepOrigemRaw = await getCepOrigem(environment)
    const cleanCepOrigem = cepOrigemRaw.replace(/\D/g, '')

    if (!cleanCepOrigem || cleanCepOrigem.length !== 8) {
      return NextResponse.json(
        { error: 'CEP de origem inválido. Configure o CEP de origem na página de Integrações.' },
        { status: 400 }
      )
    }

    // Usar o snapshot de produtos já normalizado
    const productsSnapshot = Array.isArray(quote.products_snapshot)
      ? quote.products_snapshot
      : (quote.products_snapshot ? JSON.parse(quote.products_snapshot) : [])

    if (!productsSnapshot || productsSnapshot.length === 0) {
      return NextResponse.json(
        { error: 'Snapshot de produtos da cotação está vazio' },
        { status: 400 }
      )
    }

    // Chamar Melhor Envio com os produtos salvos
    const shippingOptions = await calculateShipping({
      from: {
        postal_code: cleanCepOrigem,
      },
      to: {
        postal_code: cleanCepDestino,
      },
      products: productsSnapshot,
    }, environment)

    let validOptions = (shippingOptions || []).filter((option: any) => {
      if (!option || !option.price) return false
      const price = parseFloat(option.price)
      return !isNaN(price) && isFinite(price) && price > 0
    })

    if (!validOptions || validOptions.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma opção de frete disponível para recotação.' },
        { status: 400 }
      )
    }

    // Aplicar regras de produção e frete (sempre com applyRules = true na recotação)
    const productionDays = await getProductionDays()
    const optionsWithProduction = addProductionDaysToOptions(validOptions, productionDays)

    // Resolver estado de destino novamente para garantir consistência
    let resolvedDestinationState: string | undefined = quote.destination_state
      ? String(quote.destination_state).toUpperCase().substring(0, 2)
      : undefined

    if (!resolvedDestinationState && cleanCepDestino.length === 8) {
      try {
        const viaCepRes = await fetch(`https://viacep.com.br/ws/${cleanCepDestino}/json/`)
        if (viaCepRes.ok) {
          const viaCepData = await viaCepRes.json()
          if (viaCepData && !viaCepData.erro && viaCepData.uf) {
            resolvedDestinationState = String(viaCepData.uf).toUpperCase().substring(0, 2)
          }
        }
      } catch (e) {
        // Silencioso: se não conseguir UF, regras por estado simplesmente não se aplicam
      }
    }

    const orderValue = Number(quote.order_value) || 0

    const result = await applyShippingRules({
      shippingOptions: optionsWithProduction,
      orderValue,
      destinationState: resolvedDestinationState,
      destinationCep: cleanCepDestino,
    })

    const freeShippingRule = result.appliedRules.find(
      (r) => String(r.ruleType) === 'free_shipping' && r.applied
    )
    const freeShippingApplied = Boolean(freeShippingRule)

    // Atualizar registro em shipping_quotes
    const updateResult = await query(
      `UPDATE shipping_quotes SET
         destination_state = $1,
         order_value = $2,
         options = $3,
         applied_rules = $4,
         free_shipping_applied = $5,
         free_shipping_rule_id = $6,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        resolvedDestinationState || null,
        orderValue,
        JSON.stringify(result.options),
        JSON.stringify(result.appliedRules),
        freeShippingApplied,
        freeShippingRule ? freeShippingRule.ruleId : null,
        params.id,
      ]
    )

    return NextResponse.json(updateResult.rows[0])
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Shipping Quotes API] Erro ao recotar:', error)
    return NextResponse.json(
      { error: 'Erro ao recotar frete' },
      { status: 500 }
    )
  }
}

