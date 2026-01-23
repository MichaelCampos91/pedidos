import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'

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
      `SELECT * FROM products WHERE ${whereClause} ORDER BY name ASC`,
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
    const { name, description, base_price, active } = body

    if (!name || base_price === undefined) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: nome e preço base' },
        { status: 400 }
      )
    }

    const result = await query(
      `INSERT INTO products (name, description, base_price, active)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [name, description || null, parseFloat(base_price), active !== false]
    )

    return NextResponse.json({ success: true, id: result.rows[0].id })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao criar produto' },
      { status: 500 }
    )
  }
}
