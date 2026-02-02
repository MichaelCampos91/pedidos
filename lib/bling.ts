/**
 * Integração com a API Bling v3.
 * Documentação: https://developer.bling.com.br/
 * Referência: https://developer.bling.com.br/referencia
 * Base: https://api.bling.com.br/Api/v3 (confirmado na documentação oficial)
 * Endpoints usados: GET /pedidos/vendas?limite=1 (validação), POST /pedidos/vendas (envio), POST /contatos (criação de contato).
 * 
 * IMPORTANTE: Para criar pedidos de venda, o app Bling precisa ter escopo de Contatos (criação).
 * O sistema cria o contato no Bling antes de criar a venda, pois a API v3 exige contato.id na venda.
 */

import { query } from '@/lib/database'
import { getToken } from '@/lib/integrations'

const BLING_API_BASE = 'https://api.bling.com.br/Api/v3'

export interface BlingValidateResult {
  valid: boolean
  message: string
  details?: Record<string, unknown>
}

/**
 * Valida o token Bling fazendo uma requisição leve (GET pedidos/vendas com limite 1).
 * Usa pedidos/vendas em vez de contatos para respeitar os escopos solicitados (Pedidos de Venda).
 */
export async function validateToken(accessToken: string): Promise<BlingValidateResult> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) {
    return { valid: false, message: '[Sistema] Token não informado.' }
  }

  try {
    const url = `${BLING_API_BASE}/pedidos/vendas?limite=1`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })

    if (response.ok) {
      return { valid: true, message: 'Token válido.' }
    }

    if (response.status === 401 || response.status === 403) {
      const text = await response.text()
      let errMsg = 'Token inválido ou expirado.'
      try {
        const data = JSON.parse(text)
        errMsg = data.error?.message || data.message || errMsg
      } catch {
        if (text) errMsg = text.slice(0, 200)
      }
      return { valid: false, message: `[Bling] ${errMsg}` }
    }

    const text = await response.text()
    let errMsg = `Erro HTTP ${response.status}.`
    try {
      const data = JSON.parse(text)
      errMsg = data.error?.message || data.message || errMsg
    } catch {
      if (text) errMsg = text.slice(0, 200)
    }
    return { valid: false, message: `[Bling] ${errMsg}` }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      valid: false,
      message: `[Sistema] Erro ao validar token: ${message}`,
      details: { error: message },
    }
  }
}

/** Dados do pedido + cliente + endereço + itens para montar o payload Bling */
export interface OrderForBling {
  id: number
  total: number
  total_items: number
  total_shipping: number
  created_at: string
  observations?: string | null
  /** Número da venda no Bling (único por pedido). Se preenchido, reutilizado em reenvios. */
  bling_sale_numero?: string | null
  client_name: string
  client_cpf: string
  client_email?: string | null
  client_whatsapp?: string | null
  client_phone?: string | null
  address?: {
    street: string
    number?: string | null
    complement?: string | null
    neighborhood?: string | null
    city: string
    state: string
    cep: string
  } | null
  items: Array<{
    title: string
    price: number
    quantity: number
    observations?: string | null
  }>
}

/**
 * Gera um número único para a venda no Bling (formato PED-YYYYMMDD-XXXXXX).
 * Evita colisão com numeros já existentes na conta Bling.
 */
function generateBlingSaleNumero(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const datePart = `${y}${m}${d}`
  const randomPart = Math.random().toString(16).slice(2, 8).toUpperCase()
  return `PED-${datePart}-${randomPart}`
}

/**
 * Decodifica sequências Unicode escapadas (\uXXXX) em uma string.
 * Exemplo: "N\u00e3o foi poss\u00edvel" -> "Não foi possível"
 * 
 * O JavaScript não decodifica automaticamente sequências Unicode escapadas quando
 * extraídas de objetos JSON parseados ou quando presentes em strings JSON brutas.
 * Esta função decodifica essas sequências usando substituição direta com regex.
 */
function decodeUnicodeEscapes(str: string): string {
  if (!str || typeof str !== 'string') return str
  
  // Se a string não contém sequências Unicode escapadas, retornar como está
  if (!/\\u[0-9a-fA-F]{4}/.test(str)) return str
  
  try {
    // Substituir sequências Unicode escapadas (\uXXXX) pelo caractere correspondente
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16))
    })
  } catch {
    // Se falhar, retornar string original
    return str
  }
}

/**
 * Cria ou busca um contato no Bling usando os dados do pedido.
 * Retorna o ID do contato criado/encontrado no Bling.
 * 
 * IMPORTANTE: Requer escopo de Contatos no app Bling (OAuth).
 * Se o token não tiver permissão para criar contatos, esta função falhará.
 * O usuário deve garantir que o escopo de Contatos está selecionado no painel do Bling
 * e reautorizar o app se necessário.
 */
async function createOrFindContactInBling(
  order: OrderForBling,
  accessToken: string
): Promise<number> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) {
    throw new Error('[Sistema] Token Bling não configurado.')
  }

  const cleanCpf = (order.client_cpf || '').replace(/\D/g, '')
  if (!cleanCpf) {
    throw new Error('[Sistema] CPF/CNPJ do cliente é obrigatório para criar contato no Bling.')
  }

  const tipo = cleanCpf.length === 11 ? 'F' : 'J'

  // Montar payload do contato conforme API Bling v3
  const contactPayload: Record<string, unknown> = {
    nome: order.client_name || 'Cliente',
    numeroDocumento: cleanCpf,
    tipo,
  }

  if (order.client_email) contactPayload.email = order.client_email
  if (order.client_whatsapp) contactPayload.celular = order.client_whatsapp
  if (order.client_phone) contactPayload.telefone = order.client_phone

  // Adicionar endereço se disponível
  if (order.address) {
    contactPayload.endereco = {
      endereco: order.address.street || '',
      numero: order.address.number || 'S/N',
      complemento: order.address.complement || '',
      bairro: order.address.neighborhood || '',
      municipio: order.address.city || '',
      uf: order.address.state || '',
      cep: (order.address.cep || '').replace(/\D/g, ''),
    }
  }

  const url = `${BLING_API_BASE}/contatos`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contactPayload),
    })

    const responseText = await response.text()
    let responseData: unknown = null
    try {
      responseData = responseText ? JSON.parse(responseText) : null
    } catch {
      responseData = responseText.slice(0, 500)
    }

    if (response.ok) {
      // Extrair ID do contato criado (estrutura comum: data.id ou data.data.id)
      const contactId = extractBlingIdFromResponse(responseData)
      if (contactId != null) {
        return Number(contactId)
      }
      throw new Error('Resposta do Bling não contém ID do contato criado.')
    }

    // Se o contato já existe (409 Conflict ou mensagem específica), tentar buscar por CPF
    if (response.status === 409 || (responseData && typeof responseData === 'object' && 'error' in responseData)) {
      const errorData = responseData as { error?: { message?: string } }
      const errorMsg = errorData?.error?.message ? decodeUnicodeEscapes(errorData.error.message) : ''
      
      // Tentar buscar contato existente por CPF/CNPJ
      // A API Bling pode usar diferentes formatos de query: ?numeroDocumento=... ou filtros no body
      try {
        // Tentar busca por query parameter (formato comum em APIs REST)
        const searchUrl = `${BLING_API_BASE}/contatos?numeroDocumento=${encodeURIComponent(cleanCpf)}`
        const searchResponse = await fetch(searchUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        })

        if (searchResponse.ok) {
          const searchData = await searchResponse.json()
          // A API pode retornar array ou objeto com data
          let contacts: unknown[] = []
          if (Array.isArray(searchData)) {
            contacts = searchData
          } else if (searchData && typeof searchData === 'object' && 'data' in searchData) {
            const data = (searchData as { data: unknown }).data
            contacts = Array.isArray(data) ? data : []
          }

          if (contacts.length > 0 && typeof contacts[0] === 'object') {
            const firstContact = contacts[0] as Record<string, unknown>
            if (firstContact.id != null) {
              console.log(`[Bling] Contato encontrado por CPF/CNPJ: ${firstContact.id}`)
              return Number(firstContact.id)
            }
          }
        }
      } catch (searchErr) {
        // Se a busca falhar, continuar com erro original
        console.warn('[Bling] Erro ao buscar contato existente:', searchErr)
      }

      // Se não encontrou por busca, lançar erro informando que o contato pode já existir
      throw new Error(`Contato já existe ou erro ao criar: ${errorMsg || response.statusText}. Verifique se o CPF/CNPJ já está cadastrado no Bling.`)
    }

    // Outros erros
    let errMsg = `Erro HTTP ${response.status}.`
    if (responseData && typeof responseData === 'object' && 'error' in responseData) {
      const err = (responseData as { error?: { message?: string } }).error
      errMsg = err?.message ? decodeUnicodeEscapes(err.message) : errMsg
    }
    if (responseData && typeof responseData === 'object' && 'message' in responseData) {
      const msg = (responseData as { message: string }).message
      errMsg = decodeUnicodeEscapes(msg)
    }

    const snippet = decodeUnicodeEscapes(responseText.trim().slice(0, 300))
    throw new Error(`Não foi possível criar contato no Bling: ${errMsg}${snippet ? `. Detalhes: ${snippet}` : ''}`)
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err
    }
    throw new Error(`Erro ao criar contato no Bling: ${String(err)}`)
  }
}

/**
 * Monta o payload para POST /pedidos/vendas conforme estrutura esperada pela API Bling v3.
 * @param order Dados do pedido
 * @param blingContactId ID do contato no Bling (obrigatório na API v3). Se não fornecido, usa dados inline (compatibilidade).
 * @param numeroBling Número da venda no Bling (único por conta). Não usar order.id para evitar conflito com vendas já existentes.
 */
export function mapOrderToBlingSale(order: OrderForBling, blingContactId?: number | null, numeroBling?: string): Record<string, unknown> {
  const numero = numeroBling != null && numeroBling.trim() !== '' ? numeroBling.trim() : String(order.id)
  const dataEmissao = order.created_at ? order.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)

  // API v3 exige contato.id quando disponível
  const contato: Record<string, unknown> = blingContactId != null
    ? { id: blingContactId }
    : {
        nome: order.client_name || 'Cliente',
        numeroDocumento: (order.client_cpf || '').replace(/\D/g, ''),
        tipo: (order.client_cpf || '').replace(/\D/g, '').length === 11 ? 'F' : 'J',
      }
  
  // Se não usar id, adicionar campos opcionais inline (compatibilidade)
  if (blingContactId == null) {
    if (order.client_email) contato.email = order.client_email
    if (order.client_whatsapp) contato.celular = order.client_whatsapp
    if (order.client_phone) contato.telefone = order.client_phone
  }

  const itens = order.items.map((item, idx) => ({
    descricao: item.title || `Item ${idx + 1}`,
    quantidade: item.quantity || 1,
    valor: Number(item.price) || 0,
    observacao: item.observations || undefined,
  }))

  const payload: Record<string, unknown> = {
    numero,
    data: dataEmissao,
    contato,
    itens,
    valorTotal: Number(order.total) || 0,
    valorProdutos: Number(order.total_items) || 0,
    valorFrete: Number(order.total_shipping) || 0,
  }

  if (order.observations) {
    payload.observacao = order.observations
  }

  if (order.address) {
    payload.transporte = {
      enderecoEntrega: {
        nome: order.client_name || 'Cliente',
        endereco: order.address.street || '',
        numero: order.address.number || 'S/N',
        complemento: order.address.complement || '',
        bairro: order.address.neighborhood || '',
        municipio: order.address.city || '',
        uf: order.address.state || '',
        cep: (order.address.cep || '').replace(/\D/g, ''),
      },
    }
  }

  return payload
}

export interface SendOrderToBlingResult {
  success: boolean
  blingId?: number | string
  error?: string
}

/**
 * Extrai o id do pedido Bling da resposta da API (suporta formatos comuns: data.id, data.data.id, id na raiz).
 */
function extractBlingIdFromResponse(responseData: unknown): number | string | undefined {
  if (responseData == null || typeof responseData !== 'object') return undefined
  const obj = responseData as Record<string, unknown>
  if (obj.id != null) return obj.id as number | string
  if (obj.data != null && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>
    if (data.id != null) return data.id as number | string
    if (data.data != null && typeof data.data === 'object') {
      const inner = data.data as Record<string, unknown>
      if (inner.id != null) return inner.id as number | string
    }
  }
  return undefined
}

/**
 * Envia um pedido para o Bling (POST pedidos/vendas).
 * Não altera pagamento nem paid_at; apenas bling_sync_status e bling_sync_logs.
 */
export async function sendOrderToBling(
  orderId: number,
  accessToken: string,
  fetchOrder: (id: number) => Promise<OrderForBling | null>,
  updateOrderSync: (id: number, status: string, error: string | null) => Promise<void>,
  insertLog: (orderId: number, status: string, errorMessage: string | null, responseData: string | null) => Promise<void>
): Promise<SendOrderToBlingResult> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) {
    return { success: false, error: '[Sistema] Token Bling não configurado.' }
  }

  const order = await fetchOrder(orderId)
  if (!order) {
    return { success: false, error: 'Pedido não encontrado.' }
  }

  if (!order.address) {
    return { success: false, error: 'Pedido sem endereço de entrega. Informe o endereço antes de enviar ao Bling.' }
  }

  // Criar ou buscar contato no Bling antes de criar a venda (API v3 exige contato.id)
  let blingContactId: number
  try {
    blingContactId = await createOrFindContactInBling(order, accessToken)
  } catch (contactErr: unknown) {
    const contactErrorMsg = contactErr instanceof Error ? contactErr.message : String(contactErr)
    await updateOrderSync(orderId, 'error', contactErrorMsg)
    await insertLog(orderId, 'error', contactErrorMsg, null)
    return { success: false, error: `[Bling] Não foi possível cadastrar o cliente no Bling. ${contactErrorMsg}` }
  }

  // Número único da venda no Bling: reutilizar o já salvo ou gerar novo (evita conflito com numeros já existentes na conta)
  const numeroBling = order.bling_sale_numero?.trim() || generateBlingSaleNumero()
  const payload = mapOrderToBlingSale(order, blingContactId, numeroBling)
  const url = `${BLING_API_BASE}/pedidos/vendas`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()
    let responseData: unknown = null
    try {
      responseData = responseText ? JSON.parse(responseText) : null
    } catch {
      responseData = responseText.slice(0, 500)
    }

    if (response.ok) {
      const blingId = extractBlingIdFromResponse(responseData)
      await updateOrderSync(orderId, 'synced', null)
      await insertLog(orderId, 'success', null, blingId != null ? JSON.stringify({ id: blingId }) : responseText.slice(0, 500))
      // Persistir numero usado no Bling para reenvios e rastreabilidade; opcionalmente registrar em observations
      await query(
        `UPDATE orders SET bling_sale_numero = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [numeroBling, orderId]
      )
      const obsResult = await query(
        'SELECT observations FROM orders WHERE id = $1',
        [orderId]
      )
      const currentObs = (obsResult.rows[0] as { observations: string | null } | undefined)?.observations ?? null
      if (currentObs == null || !currentObs.includes('#ID_BLING_')) {
        const newObs = (currentObs?.trim() ? currentObs + '\n' : '') + `#ID_BLING_${numeroBling}`
        await query(
          'UPDATE orders SET observations = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newObs, orderId]
        )
      }
      return { success: true, blingId }
    }

    let errMsg = `Erro HTTP ${response.status}.`
    if (responseData && typeof responseData === 'object' && 'error' in responseData) {
      const err = (responseData as { error?: { message?: string } }).error
      errMsg = err?.message ? decodeUnicodeEscapes(err.message) : errMsg
    }
    if (responseData && typeof responseData === 'object' && 'message' in responseData) {
      const msg = (responseData as { message: string }).message
      errMsg = decodeUnicodeEscapes(msg)
    }

    const snippet = decodeUnicodeEscapes(responseText.trim().slice(0, 400))
    const details = snippet ? ` Detalhes: ${snippet}` : ''

    await updateOrderSync(orderId, 'error', errMsg)
    await insertLog(orderId, 'error', errMsg, responseText.slice(0, 1000))
    return { success: false, error: `[Bling] ${errMsg}.${details}` }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    await updateOrderSync(orderId, 'error', message)
    await insertLog(orderId, 'error', message, null)
    return { success: false, error: `[Sistema] ${message}` }
  }
}

/**
 * Busca pedido com cliente, endereço e itens no formato esperado pelo Bling (usa o banco).
 * Resiliente à ausência da coluna orders.observations (adicionada por migration).
 */
async function fetchOrderForBlingDb(orderId: number): Promise<OrderForBling | null> {
  const baseSelect = `SELECT o.id, o.total, o.total_items, o.total_shipping, o.created_at, o.shipping_address_id,
            c.name as client_name, c.cpf as client_cpf, c.email as client_email,
            c.whatsapp as client_whatsapp, c.phone as client_phone
     FROM orders o
     JOIN clients c ON o.client_id = c.id
     WHERE o.id = $1`

  let orderResult: { rows: Record<string, unknown>[] }
  let observationsValue: string | null = null
  let blingSaleNumeroValue: string | null = null

  try {
    orderResult = await query(
      `SELECT o.id, o.total, o.total_items, o.total_shipping, o.created_at, o.shipping_address_id,
              o.observations, o.bling_sale_numero,
              c.name as client_name, c.cpf as client_cpf, c.email as client_email,
              c.whatsapp as client_whatsapp, c.phone as client_phone
       FROM orders o
       JOIN clients c ON o.client_id = c.id
       WHERE o.id = $1`,
      [orderId]
    ) as { rows: Record<string, unknown>[] }
    if (orderResult.rows.length > 0) {
      const r = orderResult.rows[0]
      observationsValue = (r.observations as string | null) ?? null
      blingSaleNumeroValue = (r.bling_sale_numero as string | null) ?? null
    }
  } catch {
    orderResult = await query(baseSelect, [orderId]) as { rows: Record<string, unknown>[] }
  }

  if (orderResult.rows.length === 0) return null

  const row = orderResult.rows[0] as Record<string, unknown>
  let address: OrderForBling['address'] = null

  if (row.shipping_address_id) {
    const addrResult = await query(
      'SELECT street, number, complement, neighborhood, city, state, cep FROM client_addresses WHERE id = $1',
      [row.shipping_address_id]
    )
    if (addrResult.rows.length > 0) {
      const a = addrResult.rows[0] as Record<string, unknown>
      address = {
        street: (a.street as string) ?? '',
        number: (a.number as string | null) ?? null,
        complement: (a.complement as string | null) ?? null,
        neighborhood: (a.neighborhood as string | null) ?? null,
        city: (a.city as string) ?? '',
        state: (a.state as string) ?? '',
        cep: (a.cep as string) ?? '',
      }
    }
  }

  const itemsResult = await query(
    'SELECT title, price, quantity, observations FROM order_items WHERE order_id = $1',
    [orderId]
  )

  const orderData: OrderForBling = {
    id: row.id as number,
    total: Number(row.total) ?? 0,
    total_items: Number(row.total_items) ?? 0,
    total_shipping: Number(row.total_shipping) ?? 0,
    created_at: row.created_at ? new Date(row.created_at as string).toISOString() : new Date().toISOString(),
    observations: observationsValue,
    bling_sale_numero: blingSaleNumeroValue ?? (row.bling_sale_numero as string | null) ?? null,
    client_name: (row.client_name as string) ?? '',
    client_cpf: (row.client_cpf as string) ?? '',
    client_email: (row.client_email as string | null) ?? null,
    client_whatsapp: (row.client_whatsapp as string | null) ?? null,
    client_phone: (row.client_phone as string | null) ?? null,
    address,
    items: itemsResult.rows.map((i: Record<string, unknown>) => ({
      title: (i.title as string) ?? '',
      price: Number(i.price) ?? 0,
      quantity: Number(i.quantity) ?? 1,
      observations: (i.observations as string | null) ?? null,
    })),
  }

  return orderData
}

/**
 * Sincroniza um pedido com o Bling (obtém token, busca pedido, envia e atualiza status).
 * Pode ser chamada após marcar pedido como pago (webhook, aprovação manual, etc.).
 * Se o pedido já estiver sincronizado (bling_sync_status === 'synced'), não reenvia e retorna sucesso.
 */
export async function syncOrderToBling(orderId: number): Promise<SendOrderToBlingResult> {
  const token = await getToken('bling', 'production')
  if (!token) {
    return { success: false, error: '[Sistema] Integração Bling não configurada.' }
  }

  const statusResult = await query(
    'SELECT bling_sync_status FROM orders WHERE id = $1',
    [orderId]
  )
  if (statusResult.rows.length > 0 && statusResult.rows[0].bling_sync_status === 'synced') {
    let blingId: number | string | undefined
    const logResult = await query(
      'SELECT response_data FROM bling_sync_logs WHERE order_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [orderId, 'success']
    )
    if (logResult.rows.length > 0 && logResult.rows[0].response_data) {
      try {
        const parsed = JSON.parse(logResult.rows[0].response_data as string) as { id?: number | string }
        blingId = parsed?.id
      } catch {
        // ignore
      }
    }
    return { success: true, blingId }
  }

  const updateOrderSync = async (id: number, status: string, err: string | null) => {
    await query(
      'UPDATE orders SET bling_sync_status = $1, bling_sync_error = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [status, err, id]
    )
  }

  const insertLog = async (
    id: number,
    status: string,
    errorMessage: string | null,
    responseData: string | null
  ) => {
    await query(
      'INSERT INTO bling_sync_logs (order_id, status, error_message, response_data) VALUES ($1, $2, $3, $4)',
      [id, status, errorMessage, responseData]
    )
  }

  return sendOrderToBling(
    orderId,
    token.token_value,
    fetchOrderForBlingDb,
    updateOrderSync,
    insertLog
  )
}

// --- Sincronização em lote (categorias, produtos, clientes, pedidos) ---

export type BlingSyncEntityType = 'categories' | 'products' | 'contacts' | 'orders'

export interface BlingSyncResult {
  success: boolean
  syncedCount: number
  error?: string
}

async function upsertBlingSyncStatus(entityType: BlingSyncEntityType): Promise<void> {
  await query(
    `INSERT INTO bling_sync_status (entity_type, last_synced_at, updated_at)
     VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (entity_type) DO UPDATE SET last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
    [entityType]
  )
}

export async function getBlingSyncStatus(): Promise<Record<BlingSyncEntityType, string | null>> {
  const result = await query(
    'SELECT entity_type, last_synced_at FROM bling_sync_status',
    []
  )
  const status: Record<BlingSyncEntityType, string | null> = {
    categories: null,
    products: null,
    contacts: null,
    orders: null,
  }
  for (const row of result.rows as { entity_type: string; last_synced_at: string | null }[]) {
    if (row.entity_type in status) {
      status[row.entity_type as BlingSyncEntityType] = row.last_synced_at
        ? new Date(row.last_synced_at).toISOString()
        : null
    }
  }
  return status
}

function buildBlingError(responseText: string, response: Response): string {
  let errMsg = `Erro HTTP ${response.status}.`
  try {
    const data = JSON.parse(responseText)
    if (data?.error?.message) errMsg = decodeUnicodeEscapes(data.error.message)
    else if (data?.message) errMsg = decodeUnicodeEscapes(data.message)
  } catch {
    errMsg = decodeUnicodeEscapes(responseText.trim().slice(0, 300))
  }
  return `[Bling] ${errMsg}`
}

export async function syncCategoriesToBling(sinceDate: string, accessToken: string): Promise<BlingSyncResult> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) {
    return { success: false, syncedCount: 0, error: '[Sistema] Token Bling não configurado.' }
  }
  const rows = await query(
    'SELECT id, name, description FROM product_categories WHERE created_at >= $1::date ORDER BY id',
    [sinceDate]
  )
  let syncedCount = 0
  const url = `${BLING_API_BASE}/categorias/produtos`
  for (const row of rows.rows as { id: number; name: string; description: string | null }[]) {
    const body = { descricao: row.name || 'Categoria', nome: row.name }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const responseText = await response.text()
    if (!response.ok) {
      return { success: false, syncedCount, error: buildBlingError(responseText, response) }
    }
    syncedCount++
  }
  await upsertBlingSyncStatus('categories')
  return { success: true, syncedCount }
}

export async function syncProductsToBling(sinceDate: string, accessToken: string): Promise<BlingSyncResult> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) {
    return { success: false, syncedCount: 0, error: '[Sistema] Token Bling não configurado.' }
  }
  const rows = await query(
    `SELECT p.id, p.name, p.description, p.base_price, p.width, p.height, p.length, p.weight, p.active
     FROM products p WHERE p.created_at >= $1::date ORDER BY p.id`,
    [sinceDate]
  )
  let syncedCount = 0
  const url = `${BLING_API_BASE}/produtos`
  for (const row of rows.rows as Record<string, unknown>[]) {
    const body = {
      nome: row.name || 'Produto',
      codigo: String(row.id),
      preco: Number(row.base_price) || 0,
      descricao: (row.description as string) || undefined,
      situacao: (row.active as boolean) !== false ? 'A' : 'I',
      ...(row.width != null && { largura: Number(row.width) }),
      ...(row.height != null && { altura: Number(row.height) }),
      ...(row.length != null && { profundidade: Number(row.length) }),
      ...(row.weight != null && { peso: Number(row.weight) }),
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const responseText = await response.text()
    if (!response.ok) {
      return { success: false, syncedCount, error: buildBlingError(responseText, response) }
    }
    syncedCount++
  }
  await upsertBlingSyncStatus('products')
  return { success: true, syncedCount }
}

export async function syncContactsToBling(sinceDate: string, accessToken: string): Promise<BlingSyncResult> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) {
    return { success: false, syncedCount: 0, error: '[Sistema] Token Bling não configurado.' }
  }
  const clientsResult = await query(
    `SELECT c.id, c.name, c.cpf, c.email, c.phone, c.whatsapp, c.created_at
     FROM clients c WHERE c.created_at >= $1::date ORDER BY c.id`,
    [sinceDate]
  )
  let syncedCount = 0
  const url = `${BLING_API_BASE}/contatos`
  for (const row of clientsResult.rows as Record<string, unknown>[]) {
    const cleanCpf = String(row.cpf || '').replace(/\D/g, '')
    if (!cleanCpf) continue
    const tipo = cleanCpf.length === 11 ? 'F' : 'J'
    const contactPayload: Record<string, unknown> = {
      nome: row.name || 'Cliente',
      numeroDocumento: cleanCpf,
      tipo,
    }
    if (row.email) contactPayload.email = row.email
    if (row.whatsapp) contactPayload.celular = row.whatsapp
    if (row.phone) contactPayload.telefone = row.phone
    const addrResult = await query(
      'SELECT street, number, complement, neighborhood, city, state, cep FROM client_addresses WHERE client_id = $1 ORDER BY is_default DESC LIMIT 1',
      [row.id]
    )
    if (addrResult.rows.length > 0) {
      const a = addrResult.rows[0] as Record<string, unknown>
      contactPayload.endereco = {
        endereco: a.street || '',
        numero: a.number || 'S/N',
        complemento: a.complement || '',
        bairro: a.neighborhood || '',
        municipio: a.city || '',
        uf: a.state || '',
        cep: String(a.cep || '').replace(/\D/g, ''),
      }
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contactPayload),
    })
    const responseText = await response.text()
    if (!response.ok) {
      return { success: false, syncedCount, error: buildBlingError(responseText, response) }
    }
    syncedCount++
  }
  await upsertBlingSyncStatus('contacts')
  return { success: true, syncedCount }
}

export async function syncOrdersToBling(sinceDate: string, accessToken: string): Promise<BlingSyncResult> {
  const tokenObj = await getToken('bling', 'production')
  if (!tokenObj) {
    return { success: false, syncedCount: 0, error: '[Sistema] Integração Bling não configurada.' }
  }
  const ordersResult = await query(
    `SELECT id FROM orders WHERE created_at >= $1::date AND (bling_sync_status IS NULL OR bling_sync_status != 'synced') ORDER BY id`,
    [sinceDate]
  )
  let syncedCount = 0
  for (const row of ordersResult.rows as { id: number }[]) {
    const result = await syncOrderToBling(row.id)
    if (!result.success) {
      return { success: false, syncedCount, error: result.error || '[Bling] Erro ao sincronizar pedido.' }
    }
    syncedCount++
  }
  await upsertBlingSyncStatus('orders')
  return { success: true, syncedCount }
}
