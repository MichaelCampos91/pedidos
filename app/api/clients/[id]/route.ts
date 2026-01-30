import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { validateCPF } from '@/lib/utils'

// Marca a rota como dinâmica porque usa cookies para autenticação
export const dynamic = 'force-dynamic'

// Busca cliente por ID (protegido)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const clientResult = await query('SELECT * FROM clients WHERE id = $1', [params.id])
    
    if (clientResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      )
    }

    const client = clientResult.rows[0]

    // Buscar endereços
    const addressesResult = await query(
      'SELECT * FROM client_addresses WHERE client_id = $1 ORDER BY is_default DESC, created_at ASC',
      [params.id]
    )

    return NextResponse.json({
      ...client,
      addresses: addressesResult.rows
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    return NextResponse.json(
      { error: 'Erro ao buscar cliente' },
      { status: 500 }
    )
  }
}

// Atualiza cliente (protegido)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { cpf, cnpj, name, email, phone, whatsapp, addresses } = body

    const cleanCPF = cpf?.replace(/\D/g, '')
    const cleanWhatsApp = whatsapp?.replace(/\D/g, '')

    if (!cleanCPF || !name?.trim() || !cleanWhatsApp) {
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

    // Verifica se CPF já existe em outro cliente
    const existingResult = await query('SELECT id FROM clients WHERE cpf = $1 AND id != $2', [cleanCPF, params.id])
    if (existingResult.rows.length > 0) {
      return NextResponse.json(
        { error: 'CPF já cadastrado para outro cliente' },
        { status: 400 }
      )
    }

    // Atualiza cliente
    await query(
      `UPDATE clients SET
        cpf = $1,
        cnpj = $2,
        name = $3,
        email = $4,
        phone = $5,
        whatsapp = $6
      WHERE id = $7`,
      [cleanCPF, cnpj?.replace(/\D/g, '') || null, name?.trim() || null, email || null, (phone != null && String(phone).trim() !== '') ? String(phone).trim() : null, (whatsapp != null && String(whatsapp).trim() !== '') ? String(whatsapp).trim() : null, params.id]
    )

    // Remove endereços existentes e insere novos
    if (addresses && Array.isArray(addresses)) {
      await query('DELETE FROM client_addresses WHERE client_id = $1', [params.id])
      
      for (const address of addresses) {
        await query(
          `INSERT INTO client_addresses (client_id, cep, street, number, complement, neighborhood, city, state, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            params.id,
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

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'CPF já cadastrado' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Erro ao atualizar cliente' },
      { status: 500 }
    )
  }
}
