import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { calculateShipping } from '@/lib/melhor-envio'

const MELHOR_ENVIO_CEP_ORIGEM = process.env.MELHOR_ENVIO_CEP_ORIGEM || '16010000'

export async function POST(request: NextRequest) {
  // Verificar variáveis de ambiente no início
  const envVars = {
    MELHOR_ENVIO_TOKEN: process.env.MELHOR_ENVIO_TOKEN,
    MELHOR_ENVIO_CEP_ORIGEM: process.env.MELHOR_ENVIO_CEP_ORIGEM,
    JWT_SECRET: process.env.JWT_SECRET,
  }

  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value

    // Log detalhado no início
    console.log('[Shipping Quote] Iniciando cotação', {
      hasToken: !!envVars.MELHOR_ENVIO_TOKEN,
      hasCepOrigem: !!envVars.MELHOR_ENVIO_CEP_ORIGEM,
      hasJwtSecret: !!envVars.JWT_SECRET,
      cookiePresent: !!cookieToken,
      tokenLength: envVars.MELHOR_ENVIO_TOKEN?.length || 0,
    })

    // Autenticação
    await requireAuth(request, cookieToken)
    console.log('[Shipping Quote] Autenticação verificada com sucesso')

    const body = await request.json()
    const { cep_destino, peso, altura, largura, comprimento, valor } = body

    if (!cep_destino) {
      return NextResponse.json(
        { error: 'CEP de destino é obrigatório' },
        { status: 400 }
      )
    }

    const cleanCepDestino = cep_destino.replace(/\D/g, '')
    const cleanCepOrigem = MELHOR_ENVIO_CEP_ORIGEM.replace(/\D/g, '')

    if (cleanCepDestino.length !== 8) {
      return NextResponse.json(
        { error: 'CEP inválido' },
        { status: 400 }
      )
    }

    // Valores padrão se não fornecidos
    const weight = peso || 0.3 // kg
    const height = altura || 10 // cm
    const width = largura || 20 // cm
    const length = comprimento || 30 // cm
    const insuranceValue = valor || 100 // R$

    console.log('[Shipping Quote] Dados validados', {
      cepOrigem: cleanCepOrigem,
      cepDestino: cleanCepDestino,
      weight,
      dimensions: { width, height, length },
      insuranceValue,
    })

    // Chamar API do Melhor Envio
    const shippingOptions = await calculateShipping({
      from: {
        postal_code: cleanCepOrigem,
      },
      to: {
        postal_code: cleanCepDestino,
      },
      products: [
        {
          id: '1',
          width: width,
          height: height,
          length: length,
          weight: weight,
          insurance_value: insuranceValue,
          quantity: 1,
        },
      ],
    })

    console.log('[Shipping Quote] Cotação realizada com sucesso', {
      optionsCount: shippingOptions.length,
    })

    return NextResponse.json({
      success: true,
      options: shippingOptions,
    })
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

    // Erro de variável de ambiente
    if (error.message.includes('não configurada') || error.message.includes('está vazia')) {
      return NextResponse.json({
        error: error.message,
        details: 'Verifique as variáveis de ambiente: MELHOR_ENVIO_TOKEN, MELHOR_ENVIO_CEP_ORIGEM',
        envStatus: {
          MELHOR_ENVIO_TOKEN: !!envVars.MELHOR_ENVIO_TOKEN,
          MELHOR_ENVIO_CEP_ORIGEM: !!envVars.MELHOR_ENVIO_CEP_ORIGEM,
        }
      }, { status: 500 })
    }

    // Erro da API Melhor Envio
    return NextResponse.json({
      error: error.message || 'Erro ao calcular frete',
      details: 'Erro na comunicação com a API do Melhor Envio',
    }, { status: 500 })
  }
}
