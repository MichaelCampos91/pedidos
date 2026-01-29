import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/database'
import { generateToken, isSecureConnection } from '@/lib/auth'
import { saveLog } from '@/lib/logger'
import { cookies } from 'next/headers'

// Marca a rota como dinâmica porque usa cookies para autenticação
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    let body
    try {
      body = await request.json()
    } catch (parseError: any) {
      console.error('[Login API] Erro ao parsear JSON:', parseError)
      return NextResponse.json(
        { error: 'Erro ao processar requisição', message: 'Formato de dados inválido' },
        { status: 400 }
      )
    }
    
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      )
    }

    let result
    try {
      result = await query('SELECT * FROM admins WHERE email = $1', [email])
    } catch (dbError: any) {
      console.error('[Login API] Erro ao consultar banco de dados:', dbError)
      throw new Error(`Erro ao consultar banco de dados: ${dbError.message}`)
    }
    
    const admin = result.rows[0]

    if (!admin) {
      try {
        await saveLog('warning', 'Tentativa de login com email inválido', { email })
      } catch (logError) {
        console.error('[Login API] Erro ao salvar log:', logError)
      }
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      )
    }

    const isValidPassword = await bcrypt.compare(password, admin.password_hash)

    if (!isValidPassword) {
      try {
        await saveLog('warning', 'Tentativa de login com senha inválida', { email })
      } catch (logError) {
        console.error('[Login API] Erro ao salvar log:', logError)
      }
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      )
    }

    let token
    try {
      token = generateToken({ id: admin.id, email: admin.email })
    } catch (tokenError: any) {
      console.error('[Login API] Erro ao gerar token:', tokenError)
      throw new Error(`Erro ao gerar token: ${tokenError.message}`)
    }

    // Define cookie httpOnly
    // Detecta se deve usar secure baseado na conexão
    let secure = false
    try {
      secure = isSecureConnection(request)
    } catch (secureError: any) {
      console.error('[Login API] Erro ao detectar conexão segura:', secureError)
      // Fallback: assume seguro se NODE_ENV for production
      secure = process.env.NODE_ENV === 'production'
    }
    
    const cookieStore = cookies()
    cookieStore.set('auth_token', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 dias em segundos
      path: '/',
    })

    try {
      await saveLog('info', 'Login realizado com sucesso', { email })
    } catch (logError) {
      console.error('[Login API] Erro ao salvar log de sucesso:', logError)
      // Não bloqueia o login se o log falhar
    }

    return NextResponse.json({
      success: true,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name
      },
      token
    })
  } catch (error: any) {
    // Log detalhado do erro para debug
    let isSecure = false
    try {
      isSecure = isSecureConnection(request)
    } catch {
      // Ignora erro ao detectar conexão segura no catch
    }
    
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      // Informações adicionais para debug
      isSecureConnection: isSecure,
      url: request.url,
      headers: {
        'x-forwarded-proto': request.headers.get('x-forwarded-proto'),
        'host': request.headers.get('host'),
      },
      nodeEnv: process.env.NODE_ENV,
      forceSecureCookies: process.env.FORCE_SECURE_COOKIES,
    }
    
    console.error('[Login API] Erro detalhado:', errorDetails)
    
    // Tenta salvar log, mas não bloqueia se falhar
    try {
      await saveLog('error', 'Erro no login', errorDetails)
    } catch (logError) {
      console.error('[Login API] Erro ao salvar log de erro:', logError)
    }
    
    // Em desenvolvimento, retorna mais detalhes
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    // Sempre retorna mensagem de erro básica, mas em desenvolvimento inclui mais detalhes
    return NextResponse.json(
      { 
        error: 'Erro ao realizar login',
        message: error.message || 'Erro desconhecido',
        ...(isDevelopment && { 
          details: errorDetails,
          stack: error.stack 
        })
      },
      { status: 500 }
    )
  }
}
