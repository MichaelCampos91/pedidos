import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const result = await query(
      'SELECT id, name, description, created_at, updated_at FROM product_categories ORDER BY name ASC',
      []
    )
    return NextResponse.json(result.rows)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
      return authErrorResponse(msg, 401)
    }
    return NextResponse.json({ error: 'Erro ao listar categorias' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { name, description } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Nome da categoria é obrigatório' },
        { status: 400 }
      )
    }

    const result = await query(
      `INSERT INTO product_categories (name, description)
       VALUES ($1, $2)
       RETURNING id`,
      [name.trim(), description != null ? String(description).trim() || null : null]
    )
    return NextResponse.json({ success: true, id: result.rows[0].id })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
      return authErrorResponse(msg, 401)
    }
    return NextResponse.json({ error: 'Erro ao criar categoria' }, { status: 500 })
  }
}
