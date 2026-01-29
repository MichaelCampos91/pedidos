import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'

const JWT_SECRET = process.env.JWT_SECRET || 'pedidos-secret-key-change-in-production'

export interface TokenPayload {
  id: number
  email: string
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload
}

// Extrai token de headers ou recebe como parâmetro
export function getAuthTokenFromRequest(request: NextRequest, cookieToken?: string | null): string | null {
  // Tenta pegar do header Authorization
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }
  
  // Retorna o token do cookie se fornecido
  return cookieToken || null
}

// Verifica autenticação e retorna o payload do token
export async function requireAuth(request: NextRequest, cookieToken?: string | null): Promise<TokenPayload> {
  const token = getAuthTokenFromRequest(request, cookieToken)
  
  if (!token) {
    throw new Error('Token não fornecido')
  }

  try {
    return verifyToken(token)
  } catch (error) {
    throw new Error('Token inválido ou expirado')
  }
}

// Detecta se a conexão é segura (HTTPS)
// Verifica múltiplas fontes para garantir compatibilidade com proxies reversos como Cloud Run
export function isSecureConnection(request: NextRequest): boolean {
  // 1. Verifica variável de ambiente para override manual
  if (process.env.FORCE_SECURE_COOKIES === 'true') {
    return true
  }

  // 2. Verifica header X-Forwarded-Proto (usado por Cloud Run e outros proxies)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedProto === 'https') {
    return true
  }

  // 3. Verifica o protocolo da URL da requisição
  try {
    const url = new URL(request.url)
    if (url.protocol === 'https:') {
      return true
    }
  } catch {
    // Se não conseguir parsear a URL, continua para outros métodos
  }

  // 4. Fallback: verifica NODE_ENV (para compatibilidade)
  if (process.env.NODE_ENV === 'production') {
    return true
  }

  // Por padrão, assume conexão não segura (localhost em desenvolvimento)
  return false
}

// Helper para criar resposta de erro de autenticação
export function authErrorResponse(message: string = 'Token não fornecido', status: number = 401): NextResponse {
  return NextResponse.json({ error: message }, { status })
}
