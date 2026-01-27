import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getToken, updateTokenValidation, type IntegrationProvider, type IntegrationEnvironment } from '@/lib/integrations'
import { validateToken as validateMelhorEnvio } from '@/lib/melhor-envio'
import { validateToken as validatePagarme } from '@/lib/pagarme'

// Valida token de uma integração específica
export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { environment = 'production' } = body

    if (!['sandbox', 'production'].includes(environment)) {
      return NextResponse.json(
        { error: '[Sistema] Environment inválido. Use: sandbox ou production' },
        { status: 400 }
      )
    }

    const provider = params.provider as IntegrationProvider
    const env = environment as IntegrationEnvironment

    // Buscar token
    const token = await getToken(provider, env)

    if (!token) {
      return NextResponse.json({
        valid: false,
        status: 'error',
        message: '[Sistema] Token não encontrado',
        error: 'Configure o token antes de validar',
      }, { status: 404 })
    }

    // Validar baseado no provider
    let validationResult: { valid: boolean; message: string; details?: any }

    switch (provider) {
      case 'melhor_envio':
        validationResult = await validateMelhorEnvio(env)
        break
      
      case 'pagarme':
        validationResult = await validatePagarme(token.token_value, env)
        break
      
      case 'bling':
        // TODO: Implementar validação do Bling
        validationResult = {
          valid: false,
          message: '[Sistema] Validação do Bling ainda não implementada',
        }
        break
      
      default:
        return NextResponse.json(
          { error: '[Sistema] Provider não suportado' },
          { status: 400 }
        )
    }

    // Atualizar status de validação no banco
    const validationStatus = validationResult.valid ? 'valid' : 'invalid'
    await updateTokenValidation(
      token.id,
      validationStatus,
      validationResult.valid ? undefined : validationResult.message,
      validationResult.details
    )

    return NextResponse.json({
      valid: validationResult.valid,
      status: validationStatus,
      message: validationResult.message,
      details: validationResult.details,
      last_validated_at: new Date().toISOString(),
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    
    return NextResponse.json({
      valid: false,
      status: 'error',
      message: `[Sistema] ${error.message || 'Erro ao validar token'}`,
      error: error.message,
    }, { status: 500 })
  }
}
