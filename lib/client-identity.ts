import { query } from '@/lib/database'

export type ClientDuplicateField = 'cpf' | 'cnpj' | 'bling_contact_id'

export interface ExistingClientRow {
  id: number
  name: string
  bling_contact_id: number | null
}

const DIGITS = (column: string) => `regexp_replace(COALESCE(${column}, ''), '\\D', '', 'g')`

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * Filtro de busca da listagem de clientes.
 * Nome e e-mail usam ILIKE com curingas escapados.
 * CPF/CNPJ (11 ou 14 dígitos) e telefone (10 a 13) comparam só os dígitos,
 * inclusive telefone gravado com DDI 55.
 */
export function buildClientSearchFilter(
  search: string,
  paramIndex: number
): { sql: string; params: unknown[]; nextIndex: number } {
  const trimmed = search.trim()
  const params: unknown[] = [`%${escapeLikePattern(trimmed)}%`]
  let idx = paramIndex
  const parts = [
    `name ILIKE $${idx} ESCAPE '\\'`,
    `COALESCE(email, '') ILIKE $${idx} ESCAPE '\\'`,
  ]
  idx += 1

  const digits = trimmed.replace(/\D/g, '')
  const isDocument = digits.length === 11 || digits.length === 14
  const isPhone = digits.length >= 10 && digits.length <= 13

  if (isDocument) {
    params.push(digits)
    parts.push(`${DIGITS('cpf')} = $${idx}`)
    parts.push(`${DIGITS('cnpj')} = $${idx}`)
    idx += 1
  }

  if (isPhone) {
    params.push(digits)
    const phone = DIGITS('phone')
    const whatsapp = DIGITS('whatsapp')
    parts.push(`${phone} = $${idx}`)
    parts.push(`${whatsapp} = $${idx}`)
    parts.push(`${phone} = '55' || $${idx}`)
    parts.push(`${whatsapp} = '55' || $${idx}`)
    parts.push(`('55' || ${phone}) = $${idx}`)
    parts.push(`('55' || ${whatsapp}) = $${idx}`)
    idx += 1
  }

  return {
    sql: `(${parts.join(' OR ')})`,
    params,
    nextIndex: idx,
  }
}

export function duplicateClientMessage(field: ClientDuplicateField, name?: string | null): string {
  const base =
    field === 'cnpj'
      ? 'CNPJ já cadastrado'
      : field === 'bling_contact_id'
        ? 'ID do contato Bling já vinculado a outro cliente'
        : 'CPF já cadastrado'
  return name ? `${base} (${name})` : base
}

export function duplicateClientBody(
  field: ClientDuplicateField,
  existing: { id: number; name: string } | null
) {
  return {
    error: duplicateClientMessage(field, existing?.name),
    field,
    existingClientId: existing?.id ?? null,
    existingName: existing?.name ?? null,
  }
}

export function parseUniqueViolation(error: {
  detail?: string
  constraint?: string
}): { field: ClientDuplicateField; value: string | null } | null {
  const constraint = error.constraint || ''
  const detail = error.detail || ''
  let field: ClientDuplicateField | null = null
  if (/cnpj/i.test(constraint) || /\(cnpj\)/i.test(detail)) field = 'cnpj'
  else if (/bling_contact_id/i.test(constraint) || /\(bling_contact_id\)/i.test(detail)) field = 'bling_contact_id'
  else if (/cpf/i.test(constraint) || /\(cpf\)/i.test(detail)) field = 'cpf'
  if (!field) return null
  const valueMatch = detail.match(/=\(([^)]*)\)/)
  return { field, value: valueMatch ? valueMatch[1] : null }
}

export async function findExistingClientByField(
  field: ClientDuplicateField,
  value: string,
  excludeId?: number | string | null
): Promise<ExistingClientRow | null> {
  const params: unknown[] = []
  let sql = 'SELECT id, name, bling_contact_id FROM clients WHERE '

  if (field === 'bling_contact_id') {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) return null
    params.push(id)
    sql += `bling_contact_id = $${params.length}`
  } else {
    const digits = String(value).replace(/\D/g, '')
    if (!digits) return null
    params.push(digits)
    sql += `${DIGITS(field)} = $${params.length}`
  }

  if (excludeId != null && String(excludeId) !== '') {
    params.push(excludeId)
    sql += ` AND id <> $${params.length}`
  }

  sql += ' LIMIT 1'
  const result = await query(sql, params)
  return (result.rows[0] as ExistingClientRow | undefined) ?? null
}

export async function duplicateClientResponse(error: { detail?: string; constraint?: string }) {
  const parsed = parseUniqueViolation(error)
  if (!parsed) {
    return {
      error: 'Já existe um cadastro com estes dados',
      field: null,
      existingClientId: null,
      existingName: null,
    }
  }
  const existing = parsed.value
    ? await findExistingClientByField(parsed.field, parsed.value)
    : null
  return duplicateClientBody(parsed.field, existing)
}
