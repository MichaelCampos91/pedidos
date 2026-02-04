import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getTokenWithFallback } from '@/lib/integrations'
import { fetchAllBlingContacts, type BlingContactForImport } from '@/lib/bling'
import { query } from '@/lib/database'
import { maskPhone, capitalizeName } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type MappedAddress = {
  cep: string
  street: string
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string
  state: string
}

/**
 * Mapeia endereço do Bling para o formato da tabela client_addresses.
 * Retorna null se não houver endereço utilizável (CEP com 8 dígitos obrigatório).
 */
function mapBlingAddressToDb(
  endereco: BlingContactForImport['endereco']
): MappedAddress | null {
  if (!endereco || typeof endereco !== 'object') return null
  const cepRaw = endereco.cep != null ? String(endereco.cep).replace(/\D/g, '') : ''
  if (cepRaw.length !== 8) return null

  const street = (endereco.endereco != null ? String(endereco.endereco).trim() : '') || ''
  const number = (endereco.numero != null && String(endereco.numero).trim() !== '') ? String(endereco.numero).trim() : null
  const complement = (endereco.complemento != null && String(endereco.complemento).trim() !== '') ? String(endereco.complemento).trim() : null
  const neighborhood = (endereco.bairro != null && String(endereco.bairro).trim() !== '') ? String(endereco.bairro).trim() : null
  const city = (endereco.municipio != null ? String(endereco.municipio).trim() : '') || ''
  const state = (endereco.uf != null ? String(endereco.uf).trim().toUpperCase().substring(0, 2) : '') || ''

  return {
    cep: cepRaw,
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
  }
}

/**
 * Insere um endereço em client_addresses para o cliente (is_default = true).
 */
async function insertClientAddress(clientId: number, addr: MappedAddress): Promise<void> {
  await query(
    `INSERT INTO client_addresses (client_id, cep, street, number, complement, neighborhood, city, state, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
    [
      clientId,
      addr.cep,
      addr.street,
      addr.number,
      addr.complement,
      addr.neighborhood,
      addr.city,
      addr.state,
    ]
  )
}

/**
 * GET /api/bling/contacts/import
 * Busca todos os contatos do Bling e retorna para o frontend exibir no modal.
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const tokenValue = await getTokenWithFallback('bling', 'production')
    if (!tokenValue) {
      return NextResponse.json(
        { error: '[Sistema] Integração Bling não configurada.' },
        { status: 400 }
      )
    }

    // Buscar todos os contatos do Bling
    const contacts = await fetchAllBlingContacts(tokenValue)

    return NextResponse.json({
      success: true,
      count: contacts.length,
      contacts,
    })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = (err as { message: string }).message
      if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
        return authErrorResponse(msg, 401)
      }
    }
    const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar contatos do Bling.'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/bling/contacts/import
 * Persiste os contatos importados do Bling na tabela clients.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json().catch(() => ({}))
    const contacts: BlingContactForImport[] = body?.contacts || []

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { error: 'Lista de contatos é obrigatória e não pode estar vazia.' },
        { status: 400 }
      )
    }

    let importedCount = 0
    let updatedCount = 0
    let skippedCount = 0
    const errors: string[] = []

    for (const contact of contacts) {
      try {
        // Normalizar CPF/CNPJ (só dígitos)
        const cleanDoc = contact.numeroDocumento.replace(/\D/g, '')
        
        // Validar documento (CPF: 11 dígitos, CNPJ: 14 dígitos)
        if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
          skippedCount++
          const contactName = capitalizeName(contact.nome?.trim() || 'Sem nome')
          errors.push(`Contato "${contactName}" (ID Bling: ${contact.id}) ignorado: documento inválido (${cleanDoc.length} dígitos)`)
          continue
        }

        // Definir coluna correta: 11 dígitos = CPF, 14 dígitos = CNPJ
        const isCpf = cleanDoc.length === 11
        const cpfValue = isCpf ? cleanDoc : null
        const cnpjValue = isCpf ? null : cleanDoc

        // Formatar nome e email antes de salvar
        const formattedName = capitalizeName(contact.nome?.trim() || 'Cliente')
        const formattedEmail = contact.email?.trim().toLowerCase() || null
        const formattedPhone = contact.telefone ? maskPhone(contact.telefone) : null

        // WhatsApp é obrigatório na tabela clients - usar celular, telefone ou placeholder
        const whatsappRaw = contact.celular?.replace(/\D/g, '') || 
                           contact.telefone?.replace(/\D/g, '') || 
                           '00000000000'
        const whatsapp = maskPhone(whatsappRaw)

        const mappedAddress = mapBlingAddressToDb(contact.endereco)

        // Buscar cliente existente por documento (cpf ou cnpj conforme tamanho)
        const existingByCpf = isCpf
          ? await query('SELECT id, bling_contact_id FROM clients WHERE cpf = $1', [cleanDoc])
          : { rows: [] as { id: number; bling_contact_id: number | null }[] }
        const existingByCnpj = !isCpf
          ? await query('SELECT id, bling_contact_id FROM clients WHERE cnpj = $1', [cleanDoc])
          : { rows: [] as { id: number; bling_contact_id: number | null }[] }
        const existingByBlingId = await query(
          'SELECT id, cpf, cnpj FROM clients WHERE bling_contact_id = $1',
          [contact.id]
        )

        const updateClient = async (clientId: number) => {
          await query(
            `UPDATE clients 
             SET cpf = $1, cnpj = $2, bling_contact_id = $3,
                 name = COALESCE($4, name),
                 email = COALESCE(NULLIF($5, ''), email),
                 phone = COALESCE(NULLIF($6, ''), phone),
                 whatsapp = COALESCE(NULLIF($7, ''), whatsapp),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $8`,
            [
              cpfValue,
              cnpjValue,
              contact.id,
              formattedName,
              formattedEmail,
              formattedPhone,
              whatsapp,
              clientId,
            ]
          )
        }

        if (existingByCpf.rows.length > 0) {
          const existingClient = existingByCpf.rows[0] as { id: number; bling_contact_id: number | null }
          if (existingClient.bling_contact_id != null && existingClient.bling_contact_id !== contact.id) {
            if (existingByBlingId.rows.length > 0 && existingByBlingId.rows[0].id !== existingClient.id) {
              skippedCount++
              errors.push(`Contato "${formattedName}" (ID Bling: ${contact.id}) ignorado: conflito de IDs (cliente ${existingClient.id} já tem outro ID Bling)`)
              continue
            }
          }
          const addrCountCpf = await query('SELECT COUNT(*) AS c FROM client_addresses WHERE client_id = $1', [existingClient.id])
          const hasNoAddressesCpf = Number(addrCountCpf.rows[0]?.c ?? 0) === 0
          await updateClient(existingClient.id)
          if (hasNoAddressesCpf && mappedAddress) {
            await insertClientAddress(existingClient.id, mappedAddress)
          }
          updatedCount++
        } else if (existingByCnpj.rows.length > 0) {
          const existingClient = existingByCnpj.rows[0] as { id: number; bling_contact_id: number | null }
          if (existingClient.bling_contact_id != null && existingClient.bling_contact_id !== contact.id) {
            if (existingByBlingId.rows.length > 0 && existingByBlingId.rows[0].id !== existingClient.id) {
              skippedCount++
              errors.push(`Contato "${formattedName}" (ID Bling: ${contact.id}) ignorado: conflito de IDs (cliente ${existingClient.id} já tem outro ID Bling)`)
              continue
            }
          }
          const addrCountCnpj = await query('SELECT COUNT(*) AS c FROM client_addresses WHERE client_id = $1', [existingClient.id])
          const hasNoAddressesCnpj = Number(addrCountCnpj.rows[0]?.c ?? 0) === 0
          await updateClient(existingClient.id)
          if (hasNoAddressesCnpj && mappedAddress) {
            await insertClientAddress(existingClient.id, mappedAddress)
          }
          updatedCount++
        } else if (existingByBlingId.rows.length > 0) {
          const existingClient = existingByBlingId.rows[0] as { id: number; cpf: string | null; cnpj: string | null }
          // Conflito: outro cliente já tem este CPF ou CNPJ
          if (cpfValue) {
            const conflict = await query(
              'SELECT id FROM clients WHERE cpf = $1 AND id != $2',
              [cpfValue, existingClient.id]
            )
            if (conflict.rows.length > 0) {
              skippedCount++
              errors.push(`Contato "${formattedName}" (ID Bling: ${contact.id}) ignorado: CPF já pertence a outro cliente`)
              continue
            }
          }
          if (cnpjValue) {
            const conflict = await query(
              'SELECT id FROM clients WHERE cnpj = $1 AND id != $2',
              [cnpjValue, existingClient.id]
            )
            if (conflict.rows.length > 0) {
              skippedCount++
              errors.push(`Contato "${formattedName}" (ID Bling: ${contact.id}) ignorado: CNPJ já pertence a outro cliente`)
              continue
            }
          }
          const addrCountBling = await query('SELECT COUNT(*) AS c FROM client_addresses WHERE client_id = $1', [existingClient.id])
          const hasNoAddressesBling = Number(addrCountBling.rows[0]?.c ?? 0) === 0
          await updateClient(existingClient.id)
          if (hasNoAddressesBling && mappedAddress) {
            await insertClientAddress(existingClient.id, mappedAddress)
          }
          updatedCount++
        } else {
          const insertResult = await query(
            `INSERT INTO clients (cpf, cnpj, name, email, phone, whatsapp, bling_contact_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING id`,
            [
              cpfValue,
              cnpjValue,
              formattedName,
              formattedEmail,
              formattedPhone,
              whatsapp,
              contact.id,
            ]
          )
          const clientId = (insertResult.rows[0] as { id: number }).id
          if (mappedAddress) {
            await insertClientAddress(clientId, mappedAddress)
          }
          importedCount++
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        const contactName = capitalizeName(contact.nome?.trim() || 'Sem nome')
        skippedCount++
        errors.push(`Erro ao processar contato "${contactName}" (ID Bling: ${contact.id}): ${errorMsg}`)
      }
    }

    return NextResponse.json({
      success: true,
      importedCount,
      updatedCount,
      skippedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = (err as { message: string }).message
      if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
        return authErrorResponse(msg, 401)
      }
    }
    const errorMessage = err instanceof Error ? err.message : 'Erro ao importar contatos.'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
