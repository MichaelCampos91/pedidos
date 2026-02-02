import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'

// Marca a rota como dinâmica porque usa cookies para autenticação
export const dynamic = 'force-dynamic'

// Busca produto por ID (protegido)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const result = await query(
      `SELECT p.*, pc.name as category_name FROM products p
       LEFT JOIN product_categories pc ON p.category_id = pc.id
       WHERE p.id = $1`,
      [params.id]
    )
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Produto não encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: 'Erro ao buscar produto' },
      { status: 500 }
    )
  }
}

// Atualiza produto (protegido)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { name, description, base_price, width, height, length, weight, active, category_id } = body

    if (!name || base_price === undefined) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: nome e preço base' },
        { status: 400 }
      )
    }

    await query(
      `UPDATE products SET
        name = $1,
        description = $2,
        base_price = $3,
        width = $4,
        height = $5,
        length = $6,
        weight = $7,
        active = $8,
        category_id = $9
      WHERE id = $10`,
      [
        name, 
        description || null, 
        parseFloat(base_price),
        width ? parseFloat(width) : null,
        height ? parseFloat(height) : null,
        length ? parseFloat(length) : null,
        weight ? parseFloat(weight) : null,
        active !== false,
        category_id != null ? Number(category_id) : null,
        params.id
      ]
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao atualizar produto' },
      { status: 500 }
    )
  }
}

// Deleta produto (protegido)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    await query('DELETE FROM products WHERE id = $1', [params.id])

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao deletar produto' },
      { status: 500 }
    )
  }
}
