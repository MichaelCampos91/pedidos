import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'

// Marca a rota como dinâmica porque usa cookies para autenticação
export const dynamic = 'force-dynamic'

// Lista produtos (protegido)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const active = searchParams.get('active')

    let whereClause = '1=1'
    const params: any[] = []

    if (active !== null) {
      whereClause += ` AND active = $1`
      params.push(active === 'true')
    }

    const result = await query(
      `SELECT p.*, pc.name as category_name
       FROM products p
       LEFT JOIN product_categories pc ON p.category_id = pc.id
       WHERE ${whereClause}
       ORDER BY p.name ASC`,
      params
    )

    return NextResponse.json(result.rows)
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: 'Erro ao listar produtos' },
      { status: 500 }
    )
  }
}

// Cria produto (protegido)
export async function POST(request: NextRequest) {
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

    const result = await query(
      `INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        name, 
        description || null, 
        parseFloat(base_price),
        width ? parseFloat(width) : null,
        height ? parseFloat(height) : null,
        length ? parseFloat(length) : null,
        weight ? parseFloat(weight) : null,
        active !== false,
        category_id != null ? Number(category_id) : null
      ]
    )

    return NextResponse.json({ success: true, id: result.rows[0].id })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao criar produto' },
      { status: 500 }
    )
  }
}
