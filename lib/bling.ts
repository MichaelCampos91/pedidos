/**
 * Integração com a API Bling v3.
 * Documentação: https://developer.bling.com.br/
 * Referência: https://developer.bling.com.br/referencia
 * Base: https://api.bling.com.br/Api/v3 (confirmado na documentação oficial)
 * Endpoints usados: GET /pedidos/vendas?limite=1 (validação), POST /pedidos/vendas (envio).
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
 * Monta o payload para POST /pedidos/vendas conforme estrutura esperada pela API Bling v3.
 * Ajuste os campos conforme a documentação oficial se a API retornar erro de schema.
 */
export function mapOrderToBlingSale(order: OrderForBling): Record<string, unknown> {
  const numero = String(order.id)
  const dataEmissao = order.created_at ? order.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)

  const contato: Record<string, unknown> = {
    nome: order.client_name || 'Cliente',
    numeroDocumento: (order.client_cpf || '').replace(/\D/g, ''),
    tipo: (order.client_cpf || '').replace(/\D/g, '').length === 11 ? 'F' : 'J',
  }
  if (order.client_email) contato.email = order.client_email
  if (order.client_whatsapp) contato.celular = order.client_whatsapp
  if (order.client_phone) contato.telefone = order.client_phone

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

  const payload = mapOrderToBlingSale(order)
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
      return { success: true, blingId }
    }

    let errMsg = `Erro HTTP ${response.status}.`
    if (responseData && typeof responseData === 'object' && 'error' in responseData) {
      const err = (responseData as { error?: { message?: string } }).error
      errMsg = err?.message || errMsg
    }
    if (responseData && typeof responseData === 'object' && 'message' in responseData) {
      errMsg = (responseData as { message: string }).message
    }

    const snippet = responseText.trim().slice(0, 400)
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

  try {
    orderResult = await query(
      `SELECT o.id, o.total, o.total_items, o.total_shipping, o.created_at, o.shipping_address_id,
              o.observations,
              c.name as client_name, c.cpf as client_cpf, c.email as client_email,
              c.whatsapp as client_whatsapp, c.phone as client_phone
       FROM orders o
       JOIN clients c ON o.client_id = c.id
       WHERE o.id = $1`,
      [orderId]
    ) as { rows: Record<string, unknown>[] }
    if (orderResult.rows.length > 0) {
      observationsValue = (orderResult.rows[0].observations as string | null) ?? null
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
