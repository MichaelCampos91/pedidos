import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getActiveEnvironment, setActiveEnvironment } from '@/lib/settings'
import { getToken } from '@/lib/integrations'
import type { IntegrationProvider, IntegrationEnvironment } from '@/lib/integrations-types'

// Marca a rota como dinâmica porque usa cookies para autenticação
export const dynamic = 'force-dynamic'

// GET: Retornar ambiente ativo por provider
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const searchParams = request.nextUrl.searchParams
    const provider = searchParams.get('provider') as IntegrationProvider | null

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider é obrigatório' },
        { status: 400 }
      )
    }

    if (!['melhor_envio', 'pagarme', 'bling'].includes(provider)) {
      return NextResponse.json(
        { error: 'Provider inválido' },
        { status: 400 }
      )
    }

    // Buscar ambiente ativo configurado
    let activeEnvironment = await getActiveEnvironment(provider)

    // Se não configurado, usar fallback: produção se existir, senão sandbox
    if (!activeEnvironment) {
      const productionToken = await getToken(provider, 'production')
      const sandboxToken = await getToken(provider, 'sandbox')

      if (productionToken) {
        activeEnvironment = 'production'
      } else if (sandboxToken) {
        activeEnvironment = 'sandbox'
      } else {
        // Se nenhum token existe, retornar null
        return NextResponse.json({
          provider,
          environment: null,
          message: 'Nenhum token configurado para este provider',
        })
      }
    }

    return NextResponse.json({
      provider,
      environment: activeEnvironment,
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar ambiente ativo' },
      { status: 500 }
    )
  }
}

// POST: Salvar ambiente ativo por provider
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { provider, environment } = body

    if (!provider || !environment) {
      return NextResponse.json(
        { error: 'Provider e environment são obrigatórios' },
        { status: 400 }
      )
    }

    if (!['melhor_envio', 'pagarme', 'bling'].includes(provider)) {
      return NextResponse.json(
        { error: 'Provider inválido' },
        { status: 400 }
      )
    }

    if (!['sandbox', 'production'].includes(environment)) {
      return NextResponse.json(
        { error: 'Environment inválido. Use: sandbox ou production' },
        { status: 400 }
      )
    }

    // Verificar se token existe para o ambiente selecionado
    const token = await getToken(provider as IntegrationProvider, environment as IntegrationEnvironment)
    if (!token) {
      return NextResponse.json(
        { error: `Token não configurado para ${provider} (${environment})` },
        { status: 400 }
      )
    }

    // Salvar ambiente ativo
    await setActiveEnvironment(provider as IntegrationProvider, environment as IntegrationEnvironment)

    return NextResponse.json({
      success: true,
      provider,
      environment,
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: error.message || 'Erro ao salvar ambiente ativo' },
      { status: 500 }
    )
  }
}
