import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query, getDatabase } from '@/lib/database'
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
    const { cpf, cnpj, name, email, phone, whatsapp, addresses, bling_contact_id: blingContactIdRaw } = body

    // Normalizar bling_contact_id: null ou inteiro positivo
    let blingContactId: number | null = null
    if (blingContactIdRaw != null && blingContactIdRaw !== '') {
      const parsed = Number(blingContactIdRaw)
      if (Number.isInteger(parsed) && parsed > 0) {
        blingContactId = parsed
      }
    }

    // Garantir strings para evitar erro ao chamar .replace (ex.: quando valor vem como número do JSON)
    const cpfStr = cpf != null ? String(cpf) : ''
    const cnpjStr = cnpj != null ? String(cnpj) : ''
    const phoneStr = phone != null ? String(phone) : ''
    const whatsappStr = whatsapp != null ? String(whatsapp) : ''

    const cleanCPF = cpfStr.replace(/\D/g, '')
    const cleanWhatsApp = whatsappStr.replace(/\D/g, '')

    const nameStr = name != null ? String(name).trim() : ''
    if (!cleanCPF || !nameStr || !cleanWhatsApp) {
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

    const pool = getDatabase()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE clients SET
          cpf = $1,
          cnpj = $2,
          name = $3,
          email = $4,
          phone = $5,
          whatsapp = $6,
          bling_contact_id = $7
        WHERE id = $8`,
        [cleanCPF, (cnpjStr.replace(/\D/g, '') || null), nameStr || null, (email != null && String(email).trim() !== '') ? String(email).trim() : null, (phoneStr.trim() !== '') ? phoneStr.trim() : null, (whatsappStr.trim() !== '') ? whatsappStr.trim() : null, blingContactId, params.id]
      )
      // Endereços: atualizar existentes (com id), inserir novos (sem id), excluir só os removidos da lista
      const idsFromPayload: number[] = []
      if (addresses && Array.isArray(addresses)) {
        for (const address of addresses) {
          const cepClean = (address.cep != null ? String(address.cep).replace(/\D/g, '') : '') || null
          const street = address.street != null ? String(address.street) : null
          const number = address.number != null ? String(address.number) : null
          const complement = address.complement != null ? String(address.complement) : null
          const neighborhood = address.neighborhood != null ? String(address.neighborhood) : null
          const city = address.city != null ? String(address.city) : null
          const state = address.state != null ? String(address.state) : null
          const isDefault = address.is_default === true

          const addressId = address.id != null ? Number(address.id) : NaN
          const hasValidId = Number.isInteger(addressId) && addressId > 0

          if (hasValidId) {
            // Atualizar endereço existente (só se pertencer a este cliente)
            await client.query(
              `UPDATE client_addresses SET
                cep = $1, street = $2, number = $3, complement = $4, neighborhood = $5, city = $6, state = $7, is_default = $8, updated_at = CURRENT_TIMESTAMP
               WHERE id = $9 AND client_id = $10`,
              [cepClean, street, number, complement, neighborhood, city, state, isDefault, addressId, params.id]
            )
            idsFromPayload.push(addressId)
          } else {
            // Inserir novo endereço
            await client.query(
              `INSERT INTO client_addresses (client_id, cep, street, number, complement, neighborhood, city, state, is_default)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [params.id, cepClean, street, number, complement, neighborhood, city, state, isDefault]
            )
          }
        }
      }

      // Excluir apenas endereços que foram removidos da lista pelo usuário
      if (idsFromPayload.length > 0) {
        const notInPlaceholders = idsFromPayload.map((_, i) => `$${i + 2}`).join(', ')
        await client.query(
          `UPDATE orders SET shipping_address_id = NULL
           WHERE shipping_address_id IN (
             SELECT id FROM client_addresses WHERE client_id = $1 AND id NOT IN (${notInPlaceholders})
           )`,
          [params.id, ...idsFromPayload]
        )
        await client.query(
          `DELETE FROM client_addresses WHERE client_id = $1 AND id NOT IN (${idsFromPayload.map((_, i) => `$${i + 2}`).join(', ')})`,
          [params.id, ...idsFromPayload]
        )
      } else {
        // Nenhum endereço com id na lista: anular refs e apagar todos os endereços deste cliente
        await client.query(
          `UPDATE orders SET shipping_address_id = NULL
           WHERE shipping_address_id IN (SELECT id FROM client_addresses WHERE client_id = $1)`,
          [params.id]
        )
        await client.query('DELETE FROM client_addresses WHERE client_id = $1', [params.id])
      }
      await client.query('COMMIT')
      return NextResponse.json({ success: true })
    } catch (txError: any) {
      await client.query('ROLLBACK').catch(() => {})
      throw txError
    } finally {
      client.release()
    }
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[PUT /api/clients/:id] Erro:', error?.message ?? error)
    }
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'CPF já cadastrado' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error?.message || 'Erro ao atualizar cliente' },
      { status: 500 }
    )
  }
}
