import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getTokenWithFallback } from '@/lib/integrations'
import { fetchAllBlingContacts, fetchBlingContactDetail, type BlingContactForImport } from '@/lib/bling'
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

    // Ler limite opcional da query string
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const maxContacts = limitParam ? parseInt(limitParam, 10) : undefined
    
    // Buscar contatos do Bling (com limite se especificado)
    const contacts = await fetchAllBlingContacts(
      tokenValue,
      1000, // maxPages
      maxContacts && !isNaN(maxContacts) && maxContacts > 0 ? maxContacts : undefined
    )

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
 * Valida se um contato atende aos filtros selecionados (lógica AND).
 */
function contactMatchesFilters(
  contact: BlingContactForImport,
  filters: { email: boolean; documento: boolean; endereco: boolean }
): boolean {
  // Se nenhum filtro está selecionado, aceitar todos
  if (!filters.email && !filters.documento && !filters.endereco) {
    return true
  }

  // Validar cada condição selecionada (todas devem ser verdadeiras - AND)
  if (filters.email && !contact.email) {
    return false
  }

  if (filters.documento) {
    const cleanDoc = contact.numeroDocumento.replace(/\D/g, '')
    if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
      return false
    }
  }

  if (filters.endereco) {
    // Verificar se tem endereço válido (CEP com 8 dígitos)
    if (!contact.endereco || !contact.endereco.cep) {
      return false
    }
    const cepRaw = String(contact.endereco.cep).replace(/\D/g, '')
    if (cepRaw.length !== 8) {
      return false
    }
  }

  return true
}

/**
 * POST /api/bling/contacts/import
 * Persiste os contatos importados do Bling na tabela clients.
 * Busca detalhes completos de cada contato antes de processar e valida filtros.
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}))
    const contacts: BlingContactForImport[] = body?.contacts || []
    const filters = body?.filters || { email: false, documento: false, endereco: false }

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { error: 'Lista de contatos é obrigatória e não pode estar vazia.' },
        { status: 400 }
      )
    }

    // Criar job de importação para rastrear progresso
    const jobResult = await query(
      `INSERT INTO bling_contact_import_jobs (status, total_contacts, processed_contacts, imported_count, updated_count, skipped_count)
       VALUES ('running', $1, 0, 0, 0, 0)
       RETURNING id`,
      [contacts.length]
    )
    const jobId = (jobResult.rows[0] as { id: number }).id
    
    console.log(`[Bling] Iniciando importação de ${contacts.length} contato(s) (job ID: ${jobId})`)

    let importedCount = 0
    let updatedCount = 0
    let skippedCount = 0
    const errors: string[] = []
    const delayBetweenRequests = 350 // ms - garante < 3 req/s (limite da API Bling)
    const progressUpdateInterval = 5 // Atualizar progresso a cada 5 contatos

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i]
      
      // Delay entre requisições para respeitar rate limit (exceto na primeira)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests))
      }

      try {
        // Buscar detalhes completos do contato (incluindo email e endereço)
        const contactDetail = await fetchBlingContactDetail(contact.id, tokenValue)
        
        if (!contactDetail) {
          skippedCount++
          const contactName = capitalizeName(contact.nome?.trim() || 'Sem nome')
          errors.push(`Contato "${contactName}" (ID Bling: ${contact.id}) ignorado: não foi possível buscar detalhes completos`)
          continue
        }

        // Validar filtros nos dados completos
        if (!contactMatchesFilters(contactDetail, filters)) {
          skippedCount++
          const contactName = capitalizeName(contactDetail.nome?.trim() || 'Sem nome')
          const reasons: string[] = []
          if (filters.email && !contactDetail.email) reasons.push('sem email')
          if (filters.documento) {
            const cleanDoc = contactDetail.numeroDocumento.replace(/\D/g, '')
            if (cleanDoc.length !== 11 && cleanDoc.length !== 14) reasons.push('documento inválido')
          }
          if (filters.endereco) {
            if (!contactDetail.endereco || !contactDetail.endereco.cep) {
              reasons.push('sem endereço')
            } else {
              const cepRaw = String(contactDetail.endereco.cep).replace(/\D/g, '')
              if (cepRaw.length !== 8) reasons.push('CEP inválido')
            }
          }
          errors.push(`Contato "${contactName}" (ID Bling: ${contactDetail.id}) ignorado: ${reasons.join(', ')}`)
          continue
        }

        // Usar dados completos do contato para processar
        const fullContact = contactDetail

        // Normalizar CPF/CNPJ (só dígitos)
        const cleanDoc = fullContact.numeroDocumento.replace(/\D/g, '')
        
        // Validar documento (CPF: 11 dígitos, CNPJ: 14 dígitos)
        if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
          skippedCount++
          const contactName = capitalizeName(fullContact.nome?.trim() || 'Sem nome')
          errors.push(`Contato "${contactName}" (ID Bling: ${fullContact.id}) ignorado: documento inválido (${cleanDoc.length} dígitos)`)
          continue
        }

        // Definir coluna correta: 11 dígitos = CPF, 14 dígitos = CNPJ
        const isCpf = cleanDoc.length === 11
        const cpfValue = isCpf ? cleanDoc : null
        const cnpjValue = isCpf ? null : cleanDoc

        // Formatar nome e email antes de salvar
        const formattedName = capitalizeName(fullContact.nome?.trim() || 'Cliente')
        const formattedEmail = fullContact.email?.trim().toLowerCase() || null
        const formattedPhone = fullContact.telefone ? maskPhone(fullContact.telefone) : null

        // WhatsApp é obrigatório na tabela clients - usar celular, telefone ou placeholder
        const whatsappRaw = fullContact.celular?.replace(/\D/g, '') || 
                           fullContact.telefone?.replace(/\D/g, '') || 
                           '00000000000'
        const whatsapp = maskPhone(whatsappRaw)

        const mappedAddress = mapBlingAddressToDb(fullContact.endereco)

        // Buscar cliente existente por documento (cpf ou cnpj conforme tamanho)
        const existingByCpf = isCpf
          ? await query('SELECT id, bling_contact_id FROM clients WHERE cpf = $1', [cleanDoc])
          : { rows: [] as { id: number; bling_contact_id: number | null }[] }
        const existingByCnpj = !isCpf
          ? await query('SELECT id, bling_contact_id FROM clients WHERE cnpj = $1', [cleanDoc])
          : { rows: [] as { id: number; bling_contact_id: number | null }[] }
        const existingByBlingId = await query(
          'SELECT id, cpf, cnpj FROM clients WHERE bling_contact_id = $1',
          [fullContact.id]
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
              fullContact.id,
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
          if (existingClient.bling_contact_id != null && existingClient.bling_contact_id !== fullContact.id) {
            if (existingByBlingId.rows.length > 0 && existingByBlingId.rows[0].id !== existingClient.id) {
              skippedCount++
              errors.push(`Contato "${formattedName}" (ID Bling: ${fullContact.id}) ignorado: conflito de IDs (cliente ${existingClient.id} já tem outro ID Bling)`)
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
          if (existingClient.bling_contact_id != null && existingClient.bling_contact_id !== fullContact.id) {
            if (existingByBlingId.rows.length > 0 && existingByBlingId.rows[0].id !== existingClient.id) {
              skippedCount++
              errors.push(`Contato "${formattedName}" (ID Bling: ${fullContact.id}) ignorado: conflito de IDs (cliente ${existingClient.id} já tem outro ID Bling)`)
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
              errors.push(`Contato "${formattedName}" (ID Bling: ${fullContact.id}) ignorado: CPF já pertence a outro cliente`)
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
              errors.push(`Contato "${formattedName}" (ID Bling: ${fullContact.id}) ignorado: CNPJ já pertence a outro cliente`)
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
              fullContact.id,
            ]
          )
          const clientId = (insertResult.rows[0] as { id: number }).id
          if (mappedAddress) {
            await insertClientAddress(clientId, mappedAddress)
          }
          importedCount++
        }

        // Atualizar progresso periodicamente (a cada N contatos ou no último)
        const processedTotal = importedCount + updatedCount + skippedCount
        if ((i + 1) % progressUpdateInterval === 0 || (i + 1) === contacts.length) {
          await query(
            `UPDATE bling_contact_import_jobs 
             SET processed_contacts = $1, imported_count = $2, updated_count = $3, skipped_count = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5`,
            [processedTotal, importedCount, updatedCount, skippedCount, jobId]
          )
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        const contactName = capitalizeName(contact.nome?.trim() || 'Sem nome')
        skippedCount++
        errors.push(`Erro ao processar contato "${contactName}" (ID Bling: ${contact.id}): ${errorMsg}`)
        
        // Atualizar progresso mesmo em caso de erro
        const processedTotal = importedCount + updatedCount + skippedCount
        if ((i + 1) % progressUpdateInterval === 0 || (i + 1) === contacts.length) {
          await query(
            `UPDATE bling_contact_import_jobs 
             SET processed_contacts = $1, imported_count = $2, updated_count = $3, skipped_count = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5`,
            [processedTotal, importedCount, updatedCount, skippedCount, jobId]
          )
        }
      }
    }

    // Finalizar job com sucesso
    await query(
      `UPDATE bling_contact_import_jobs 
       SET status = 'completed', finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [jobId]
    )
    
    console.log(`[Bling] Importação concluída (job ID: ${jobId}): ${importedCount} importado(s), ${updatedCount} atualizado(s), ${skippedCount} ignorado(s)`)

    return NextResponse.json({
      success: true,
      importedCount,
      updatedCount,
      skippedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: unknown) {
    // Em caso de erro não tratado, marcar job como failed
    try {
      const lastJob = await query(
        `SELECT id FROM bling_contact_import_jobs 
         WHERE status = 'running' 
         ORDER BY started_at DESC LIMIT 1`
      )
      if (lastJob.rows.length > 0) {
        const failedJobId = (lastJob.rows[0] as { id: number }).id
        const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido ao importar contatos.'
        await query(
          `UPDATE bling_contact_import_jobs 
           SET status = 'failed', finished_at = CURRENT_TIMESTAMP, error_message = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [errorMessage, failedJobId]
        )
      }
    } catch (updateErr) {
      // Ignorar erro ao atualizar job, não queremos mascarar o erro original
    }
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
