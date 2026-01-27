import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'

// Adiciona endereço ao cliente (protegido)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    // Verificar se cliente existe
    const clientResult = await query('SELECT id FROM clients WHERE id = $1', [params.id])
    
    if (clientResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { cep, street, number, complement, neighborhood, city, state, is_default } = body

    // Validações
    if (!cep || !street || !number || !city || !state) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: CEP, rua, número, cidade e estado' },
        { status: 400 }
      )
    }

    const cleanCep = cep.replace(/\D/g, '')
    if (cleanCep.length !== 8) {
      return NextResponse.json(
        { error: 'CEP inválido' },
        { status: 400 }
      )
    }

    // Se is_default for true, atualizar outros endereços para false
    if (is_default) {
      await query(
        'UPDATE client_addresses SET is_default = false WHERE client_id = $1',
        [params.id]
      )
    }

    // Inserir novo endereço
    const result = await query(
      `INSERT INTO client_addresses (client_id, cep, street, number, complement, neighborhood, city, state, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        params.id,
        cleanCep,
        street,
        number,
        complement || null,
        neighborhood || null,
        city,
        state.toUpperCase(),
        is_default || false
      ]
    )

    const newAddress = result.rows[0]

    return NextResponse.json({
      success: true,
      address: newAddress
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: 'Erro ao adicionar endereço' },
      { status: 500 }
    )
  }
}
