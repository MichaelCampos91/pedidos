import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/database'
import { generateToken } from '@/lib/auth'
import { saveLog } from '@/lib/logger'
import { cookies } from 'next/headers'

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
    const cookieStore = cookies()
    cookieStore.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
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
    await saveLog('error', 'Erro no login', { error: error.message })
    return NextResponse.json(
      {
        error: 'Erro ao realizar login',
        message: error?.message || 'Erro desconhecido',
      },
      { status: 500 }
    )
  }
}
