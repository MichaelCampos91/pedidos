import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { id } = await params
    const result = await query(
      'SELECT id, name, description, created_at, updated_at FROM product_categories WHERE id = $1',
      [id]
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 })
    }
    return NextResponse.json(result.rows[0])
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
      return authErrorResponse(msg, 401)
    }
    return NextResponse.json({ error: 'Erro ao buscar categoria' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { id } = await params
    const body = await request.json()
    const { name, description } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Nome da categoria é obrigatório' },
        { status: 400 }
      )
    }

    const result = await query(
      `UPDATE product_categories SET name = $1, description = $2 WHERE id = $3 RETURNING id`,
      [name.trim(), description != null ? String(description).trim() || null : null, id]
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
      return authErrorResponse(msg, 401)
    }
    return NextResponse.json({ error: 'Erro ao atualizar categoria' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { id } = await params
    const result = await query('DELETE FROM product_categories WHERE id = $1 RETURNING id', [id])
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
      return authErrorResponse(msg, 401)
    }
    return NextResponse.json({ error: 'Erro ao excluir categoria' }, { status: 500 })
  }
}
