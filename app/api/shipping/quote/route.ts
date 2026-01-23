import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { calculateShipping } from '@/lib/melhor-envio'

const MELHOR_ENVIO_CEP_ORIGEM = process.env.MELHOR_ENVIO_CEP_ORIGEM || '16010000'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

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

    return NextResponse.json({
      success: true,
      options: shippingOptions,
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: error.message || 'Erro ao calcular frete' },
      { status: 500 }
    )
  }
}
