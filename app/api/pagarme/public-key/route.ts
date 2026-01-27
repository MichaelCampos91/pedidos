import { NextRequest, NextResponse } from 'next/server'
import { getToken } from '@/lib/integrations'
import type { IntegrationEnvironment } from '@/lib/integrations-types'

// Detectar ambiente baseado em NODE_ENV ou hostname
function detectEnvironment(request: NextRequest): 'sandbox' | 'production' {
  // Verificar variável de ambiente primeiro
  if (process.env.NODE_ENV === 'development') {
    return 'sandbox'
  }
  
  // Verificar hostname da requisição
  const hostname = request.headers.get('host') || ''
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes('192.168.') || hostname.includes('10.') || hostname.includes('172.')) {
    return 'sandbox'
  }
  
  // Verificar variável de ambiente específica
  if (process.env.PAGARME_ENVIRONMENT === 'sandbox') {
    return 'sandbox'
  }
  
  return 'production'
}

// Função auxiliar para mascarar dados sensíveis nos logs
function maskSensitiveData(value: string, showLast: number = 8): string {
  if (!value || value.length <= showLast) return '***'
  return `${'*'.repeat(value.length - showLast)}${value.substring(value.length - showLast)}`
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const environmentParam = searchParams.get('environment') as 'sandbox' | 'production' | null
    
    // Detectar ambiente se não foi fornecido
    const environment = environmentParam || detectEnvironment(request)
    console.log('[Pagar.me Public Key API] Requisição recebida:', {
      environmentParam,
      detectedEnvironment: environment,
      hostname: request.headers.get('host'),
    })
    
    // Buscar token do Pagar.me do banco
    console.log('[Pagar.me Public Key API] Buscando token no banco de dados...')
    const token = await getToken('pagarme', environment)
    
    if (!token) {
      console.warn('[Pagar.me Public Key API] Token não encontrado no banco para ambiente:', environment)
      return NextResponse.json(
        { error: `Token do Pagar.me não configurado para ambiente ${environment}` },
        { status: 404 }
      )
    }
    
    console.log('[Pagar.me Public Key API] Token encontrado no banco:', {
      tokenId: token.id,
      hasAdditionalData: !!token.additional_data,
      additionalDataKeys: token.additional_data ? Object.keys(token.additional_data) : [],
    })
    
    // A public key pode estar em additional_data ou em variável de ambiente
    // O Pagar.me usa public_key para tokenização no frontend
    let publicKey = token.additional_data?.public_key || null
    
    if (publicKey) {
      console.log('[Pagar.me Public Key API] Public key encontrada em additional_data:', {
        hasKey: true,
        keyPreview: maskSensitiveData(publicKey, 8),
      })
    } else {
      console.log('[Pagar.me Public Key API] Public key não encontrada em additional_data, tentando variável de ambiente...')
    }
    
    // Fallback para variável de ambiente
    if (!publicKey) {
      const envKey = environment === 'sandbox' 
        ? 'PAGARME_PUBLIC_KEY_SANDBOX' 
        : 'PAGARME_PUBLIC_KEY'
      publicKey = process.env[envKey] || null
      
      if (publicKey) {
        console.log('[Pagar.me Public Key API] Public key encontrada em variável de ambiente:', {
          envKey,
          hasKey: true,
          keyPreview: maskSensitiveData(publicKey, 8),
        })
      } else {
        console.warn('[Pagar.me Public Key API] Public key não encontrada em variável de ambiente:', envKey)
      }
    }
    
    if (!publicKey) {
      console.error('[Pagar.me Public Key API] Public key não configurada:', {
        environment,
        hasTokenInDb: !!token,
        hasAdditionalData: !!token?.additional_data,
        envKeySandbox: 'PAGARME_PUBLIC_KEY_SANDBOX',
        envKeyProduction: 'PAGARME_PUBLIC_KEY',
      })
      return NextResponse.json(
        { 
          error: `Public key do Pagar.me não configurada para ambiente ${environment}`,
          message: 'Configure a public key nas configurações de integração ou na variável de ambiente PAGARME_PUBLIC_KEY'
        },
        { status: 404 }
      )
    }
    
    console.log('[Pagar.me Public Key API] Public key retornada com sucesso:', {
      environment,
      keyPreview: maskSensitiveData(publicKey, 8),
    })
    
    return NextResponse.json({
      publicKey,
      environment,
    })
  } catch (error: any) {
    console.error('[Pagar.me Public Key API] Erro:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    })
      return NextResponse.json(
        { error: error.message || 'Erro ao obter public key' },
        { status: 500 }
      )
  }
}
