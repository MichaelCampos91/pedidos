import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/database'
import { generateToken } from '@/lib/auth'
import { saveLog } from '@/lib/logger'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      )
    }

    const result = await query('SELECT * FROM admins WHERE email = $1', [email])
    const admin = result.rows[0]

    if (!admin) {
      await saveLog('warning', 'Tentativa de login com email inválido', { email })
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      )
    }

    const isValidPassword = await bcrypt.compare(password, admin.password_hash)

    if (!isValidPassword) {
      await saveLog('warning', 'Tentativa de login com senha inválida', { email })
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      )
    }

    const token = generateToken({ id: admin.id, email: admin.email })

    // Define cookie httpOnly
    const cookieStore = cookies()
    cookieStore.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 dias em segundos
      path: '/',
    })

    await saveLog('info', 'Login realizado com sucesso', { email })

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
      { error: 'Erro ao realizar login' },
      { status: 500 }
    )
  }
}
