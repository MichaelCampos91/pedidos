import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { validateCPF } from '@/lib/utils'

// Lista clientes (protegido)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const per_page = parseInt(searchParams.get('per_page') || '20')
    const search = searchParams.get('search')
    const sort = searchParams.get('sort') || 'created_at'
    const order = searchParams.get('order') || 'desc'

    const offset = (page - 1) * per_page
    const allowedSorts = ['created_at', 'name', 'cpf']
    const sortColumn = allowedSorts.includes(sort) ? sort : 'created_at'
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC'

    let whereClause = '1=1'
    const params: any[] = []
    let paramIndex = 1

    // Busca por texto (case-insensitive)
    if (search) {
      const searchTerm = `%${search}%`
      whereClause += ` AND (name ILIKE $${paramIndex} OR cpf ILIKE $${paramIndex + 1} OR phone ILIKE $${paramIndex + 2} OR whatsapp ILIKE $${paramIndex + 3})`
      params.push(searchTerm, searchTerm, searchTerm, searchTerm)
      paramIndex += 4
    }

    // Total de registros
    const countResult = await query(`SELECT COUNT(*) as total FROM clients WHERE ${whereClause}`, params)
    const total = parseInt(countResult.rows[0].total)

    // Busca paginada
    const queryText = `
      SELECT * FROM clients
      WHERE ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    const queryParams = [...params, per_page, offset]
    const clientsResult = await query(queryText, queryParams)

    // Buscar endereços para cada cliente
    const clientsWithAddresses = await Promise.all(
      clientsResult.rows.map(async (client) => {
        const addressesResult = await query(
          'SELECT * FROM client_addresses WHERE client_id = $1 ORDER BY is_default DESC, created_at ASC',
          [client.id]
        )
        return {
          ...client,
          addresses: addressesResult.rows
        }
      })
    )

    const lastPage = Math.ceil(total / per_page)

    return NextResponse.json({
      data: clientsWithAddresses,
      current_page: page,
      per_page,
      total,
      last_page: lastPage,
      from: offset + 1,
      to: Math.min(offset + per_page, total)
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: 'Erro ao listar clientes' },
      { status: 500 }
    )
  }
}

// Cria cliente (protegido)
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { cpf, cnpj, name, email, phone, whatsapp, addresses } = body

    const cleanCPF = cpf?.replace(/\D/g, '')
    const cleanWhatsApp = whatsapp?.replace(/\D/g, '')

    if (!cleanCPF || !name || !cleanWhatsApp) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: CPF, nome e WhatsApp' },
        { status: 400 }
      )
    }

    if (!validateCPF(cleanCPF)) {
      return NextResponse.json(
        { error: 'CPF inválido' },
        { status: 400 }
      )
    }

    // Verifica se CPF já existe
    const existingResult = await query('SELECT id FROM clients WHERE cpf = $1', [cleanCPF])
    if (existingResult.rows.length > 0) {
      return NextResponse.json(
        { error: 'CPF já cadastrado' },
        { status: 400 }
      )
    }

    // Insere cliente
    const result = await query(
      `INSERT INTO clients (cpf, cnpj, name, email, phone, whatsapp)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [cleanCPF, cnpj?.replace(/\D/g, '') || null, name, email || null, phone?.replace(/\D/g, '') || null, cleanWhatsApp]
    )

    const clientId = result.rows[0].id

    // Insere endereços se fornecidos
    if (addresses && Array.isArray(addresses)) {
      for (const address of addresses) {
        await query(
          `INSERT INTO client_addresses (client_id, cep, street, number, complement, neighborhood, city, state, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            clientId,
            address.cep?.replace(/\D/g, ''),
            address.street,
            address.number,
            address.complement || null,
            address.neighborhood || null,
            address.city,
            address.state,
            address.is_default || false
          ]
        )
      }
    }

    return NextResponse.json({ success: true, id: clientId })
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      return NextResponse.json(
        { error: 'CPF já cadastrado' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Erro ao criar cliente' },
      { status: 500 }
    )
  }
}
