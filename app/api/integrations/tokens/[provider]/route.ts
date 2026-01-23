import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getToken, upsertToken, deactivateToken, deleteToken, type IntegrationProvider, type IntegrationEnvironment, type TokenType } from '@/lib/integrations'

// Busca token específico
export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const environment = searchParams.get('environment') || 'production'

    if (!['sandbox', 'production'].includes(environment)) {
      return NextResponse.json(
        { error: 'Environment inválido. Use: sandbox ou production' },
        { status: 400 }
      )
    }

    const token = await getToken(
      params.provider as IntegrationProvider,
      environment as IntegrationEnvironment
    )

    if (!token) {
      return NextResponse.json(
        { error: 'Token não encontrado' },
        { status: 404 }
      )
    }

    // Mascarar token na resposta
    const maskedToken = {
      ...token,
      token_value: `****${token.token_value.substring(token.token_value.length - 4)}`,
    }

    return NextResponse.json({ token: maskedToken })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: 'Erro ao buscar token' },
      { status: 500 }
    )
  }
}

// Atualiza token
export async function PUT(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { environment, token_value, token_type, additional_data } = body

    if (!environment || !token_value) {
      return NextResponse.json(
        { error: 'Environment e token_value são obrigatórios' },
        { status: 400 }
      )
    }

    const token = await upsertToken(
      params.provider as IntegrationProvider,
      environment as IntegrationEnvironment,
      token_value,
      (token_type || 'bearer') as TokenType,
      additional_data
    )

    // Mascarar token na resposta
    const maskedToken = {
      ...token,
      token_value: `****${token.token_value.substring(token.token_value.length - 4)}`,
    }

    return NextResponse.json({ token: maskedToken, success: true })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: error.message || 'Erro ao atualizar token' },
      { status: 500 }
    )
  }
}

// Desativa token
export async function DELETE(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const environment = searchParams.get('environment') || 'production'

    if (!['sandbox', 'production'].includes(environment)) {
      return NextResponse.json(
        { error: 'Environment inválido. Use: sandbox ou production' },
        { status: 400 }
      )
    }

    const action = searchParams.get('action') || 'deactivate' // 'deactivate' ou 'delete'

    if (action === 'delete') {
      await deleteToken(
        params.provider as IntegrationProvider,
        environment as IntegrationEnvironment
      )
    } else {
      await deactivateToken(
        params.provider as IntegrationProvider,
        environment as IntegrationEnvironment
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: 'Erro ao desativar/deletar token' },
      { status: 500 }
    )
  }
}
