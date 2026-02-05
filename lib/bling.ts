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
import { getToken, getTokenWithFallback } from '@/lib/integrations'

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
    const response = await fetchWithRetry(url, {
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
  /** ID do contato no Bling (se o cliente foi importado do Bling). */
  client_bling_contact_id?: number | null
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
 * Mascara dados sensíveis para logs (CPF parcial, email parcial).
 */
function maskSensitiveData(data: string): string {
  if (!data || typeof data !== 'string') return data
  // Mascarar CPF: 12345678901 -> 123***8901
  let masked = data.replace(/(\d{3})\d{5}(\d{3})/g, '$1***$2')
  // Mascarar email: joao@email.com -> jo***@email.com
  masked = masked.replace(/([a-zA-Z0-9]{2})[a-zA-Z0-9]+@/g, '$1***@')
  return masked
}

/**
 * Loga requisições ao Bling de forma estruturada.
 * Remove tokens e mascara dados sensíveis.
 */
function logBlingRequest(
  step: string,
  method: string,
  url: string,
  status: number | null,
  responseBody?: unknown
): void {
  const urlSafe = url.replace(/Bearer\s+[\w-]+/gi, 'Bearer ***')
  const summary = responseBody
    ? maskSensitiveData(JSON.stringify(responseBody).slice(0, 200))
    : ''
  const statusStr = status != null ? String(status) : 'N/A'
  console.log(`[Bling] [${step}] ${method} ${urlSafe} → ${statusStr}${summary ? ` | ${summary}` : ''}`)
}

/**
 * Wrapper para fetch com retry inteligente.
 * Retry apenas para 5xx e 429 (rate limit), com backoff exponencial.
 * Não retry para 4xx de validação ou 401/403.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      
      // Se sucesso ou erro não recuperável, retornar imediatamente
      if (response.ok) {
        return response
      }
      
      const status = response.status
      
      // Não retry para erros de validação ou autenticação
      if (status === 401 || status === 403 || (status >= 400 && status < 500 && status !== 429)) {
        return response
      }
      
      // Retry para 5xx e 429
      if (status >= 500 || status === 429) {
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000) // Máx 10s
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
      }
      
      return response
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw lastError
    }
  }
  
  throw lastError || new Error('Erro desconhecido após retries')
}

/**
 * Extrai a lista de contatos do body da resposta GET /contatos (suporta data ou array na raiz).
 */
function parseBlingContactsList(responseData: unknown): unknown[] {
  if (Array.isArray(responseData)) return responseData
  if (responseData && typeof responseData === 'object' && 'data' in responseData) {
    const data = (responseData as { data: unknown }).data
    return Array.isArray(data) ? data : []
  }
  return []
}

/**
 * Retorna o número do documento do contato (só dígitos) ou string vazia.
 * A API pode retornar numeroDocumento ou numero_documento.
 */
function getContactDocumentDigits(contact: Record<string, unknown>): string {
  const doc =
    (contact.numeroDocumento as string) ??
    (contact.numero_documento as string) ??
    ''
  return String(doc).replace(/\D/g, '')
}

/**
 * Extrai e-mail do contato Bling. A API pode retornar em nível raiz, em tiposContato ou em pessoaFisica.
 */
function getContactEmail(contact: Record<string, unknown>): string | null {
  const fromTop = contact.email
  if (fromTop != null && typeof fromTop === 'string') {
    const s = fromTop.trim()
    if (s && s.includes('@')) return s
  }

  const tiposContato = contact.tiposContato ?? contact.tipos_contato
  if (Array.isArray(tiposContato)) {
    for (const item of tiposContato) {
      if (item && typeof item === 'object') {
        const t = item as Record<string, unknown>
        const tipo = String(t.tipo ?? t.descricao ?? '').toLowerCase()
        if (tipo === 'email' || tipo === 'e-mail') {
          const valor = t.valor ?? t.contato ?? t.descricao
          if (valor != null && typeof valor === 'string') {
            const s = valor.trim()
            if (s && s.includes('@')) return s
          }
        }
      }
    }
  }

  const pf = contact.pessoaFisica ?? contact.pessoa_fisica
  if (pf && typeof pf === 'object') {
    const email = (pf as Record<string, unknown>).email
    if (email != null && typeof email === 'string') {
      const s = email.trim()
      if (s && s.includes('@')) return s
    }
  }

  return null
}

/**
 * Extrai endereço de um contato do Bling normalizando diferentes formatos possíveis.
 * Suporta:
 * - Formato v3: endereco.geral e endereco.cobranca
 * - Formato com objeto aninhado: contact.endereco = { endereco, numero, ... }
 * - Formato com lista: contact.enderecos = [ { ... } ] ou { data: [ ... ] }
 * - Campos flat diretamente no contato (formato v2)
 * - enderecoEntrega (fallback para pedidos)
 */
function extractBlingAddress(contact: Record<string, unknown>): BlingContactForImport['endereco'] | null {
  let addrSource: Record<string, unknown> | null = null

  // 1) Formato v3: endereco.geral e endereco.cobranca
  if (contact.endereco && typeof contact.endereco === 'object' && !Array.isArray(contact.endereco)) {
    const enderecoObj = contact.endereco as Record<string, unknown>

    // Tentar endereco.geral primeiro (formato v3 mais comum)
    if (enderecoObj.geral && typeof enderecoObj.geral === 'object' && !Array.isArray(enderecoObj.geral)) {
      const geral = enderecoObj.geral as Record<string, unknown>
      // Verificar se tem pelo menos CEP ou endereço preenchido
      if (geral.cep || geral.endereco) {
        addrSource = geral
      }
    }

    // Se geral não tiver dados válidos, tentar cobranca
    if (!addrSource && enderecoObj.cobranca && typeof enderecoObj.cobranca === 'object' && !Array.isArray(enderecoObj.cobranca)) {
      const cobranca = enderecoObj.cobranca as Record<string, unknown>
      if (cobranca.cep || cobranca.endereco) {
        addrSource = cobranca
      }
    }

    // Se ainda não encontrou e endereco tem campos diretos (sem geral/cobranca), usar diretamente
    if (!addrSource && (enderecoObj.endereco || enderecoObj.cep)) {
      addrSource = enderecoObj
    }
  }

  // 2) Lista contact.enderecos (pegar o primeiro; pode vir como array direto ou { data: [...] })
  if (!addrSource && contact.enderecos) {
    const rawEnderecos = contact.enderecos as unknown
    let list: unknown[] = []

    if (Array.isArray(rawEnderecos)) {
      list = rawEnderecos
    } else if (rawEnderecos && typeof rawEnderecos === 'object' && 'data' in (rawEnderecos as Record<string, unknown>)) {
      const dataField = (rawEnderecos as { data: unknown }).data
      if (Array.isArray(dataField)) {
        list = dataField
      }
    }

    if (list.length > 0) {
      const firstAddr = list[0]
      if (firstAddr && typeof firstAddr === 'object') {
        addrSource = firstAddr as Record<string, unknown>
      }
    }
  }

  // 3) Campos de endereço diretamente no contato (formato clássico da API v2)
  if (!addrSource) {
    const hasFlatAddressFields =
      contact.endereco != null ||
      contact.numero != null ||
      contact.complemento != null ||
      contact.bairro != null ||
      contact.municipio != null ||
      (contact as Record<string, unknown>).cidade != null ||
      contact.uf != null ||
      contact.cep != null

    if (hasFlatAddressFields) {
      const cidade =
        (contact.municipio as unknown) ??
        (contact as Record<string, unknown>).cidade

      addrSource = {
        endereco: contact.endereco,
        numero: contact.numero,
        complemento: contact.complemento,
        bairro: contact.bairro,
        municipio: cidade,
        uf: contact.uf,
        cep: contact.cep,
      } as Record<string, unknown>
    }
  }

  // 4) Fallback: endereço de entrega (mais comum em pedidos, mas mantido por segurança)
  if (!addrSource && contact.enderecoEntrega && typeof contact.enderecoEntrega === 'object' && !Array.isArray(contact.enderecoEntrega)) {
    addrSource = contact.enderecoEntrega as Record<string, unknown>
  }

  // Normalizar addrSource para BlingContactForImport['endereco']
  if (addrSource) {
    return {
      endereco: addrSource.endereco ? String(addrSource.endereco).trim() : undefined,
      numero: addrSource.numero ? String(addrSource.numero).trim() : undefined,
      complemento: addrSource.complemento ? String(addrSource.complemento).trim() : undefined,
      bairro: addrSource.bairro ? String(addrSource.bairro).trim() : undefined,
      municipio: addrSource.municipio ? String(addrSource.municipio).trim() : undefined,
      uf: addrSource.uf ? String(addrSource.uf).trim() : undefined,
      cep: addrSource.cep ? String(addrSource.cep).replace(/\D/g, '') : undefined,
    }
  }

  return null
}

/**
 * Tipo para contato do Bling usado na importação.
 */
export interface BlingContactForImport {
  id: number
  nome: string
  numeroDocumento: string
  email?: string | null
  celular?: string | null
  telefone?: string | null
  endereco?: {
    endereco?: string
    numero?: string
    complemento?: string
    bairro?: string
    municipio?: string
    uf?: string
    cep?: string
  } | null
}

/**
 * Busca todos os contatos do Bling paginando até o fim.
 * Respeita rate limit com delay de 350ms entre requisições.
 * Retorna array normalizado de contatos para importação.
 * 
 * @param accessToken Token de acesso do Bling
 * @param maxPages Limite máximo de páginas a buscar (padrão: 1000, ~100k contatos)
 * @param maxContacts Limite máximo de contatos a retornar (padrão: 10000)
 * @returns Array de contatos normalizados
 */
export async function fetchAllBlingContacts(
  accessToken: string,
  maxPages: number = 1000,
  maxContacts: number = 10000
): Promise<BlingContactForImport[]> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) {
    throw new Error('[Sistema] Token Bling não configurado.')
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }

  const limit = 100
  const delayBetweenRequests = 350 // ms - garante < 3 req/s (limite da API)
  const allContacts: BlingContactForImport[] = []

  logBlingRequest('fetchAllBlingContacts', 'INICIO', 'Buscar todos os contatos', null, { maxPages, maxContacts })

  for (let page = 1; page <= maxPages; page++) {
    // Parar se atingiu limite de contatos
    if (allContacts.length >= maxContacts) {
      console.warn(`[Bling] Limite de ${maxContacts} contatos atingido. Importação parcial.`)
      logBlingRequest('fetchAllBlingContacts', 'LIMITE', 'Limite de contatos atingido', null, { total: allContacts.length })
      break
    }

    try {
      // Delay antes de cada requisição (exceto a primeira)
      if (page > 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests))
      }

      const listUrl = `${BLING_API_BASE}/contatos?pagina=${page}&limite=${limit}`
      const listResponse = await fetchWithRetry(listUrl, { method: 'GET', headers })
      
      if (!listResponse.ok) {
        // Parar se erro não recuperável (4xx que não seja 429)
        if (listResponse.status >= 400 && listResponse.status < 500 && listResponse.status !== 429) {
          logBlingRequest('fetchAllBlingContacts', 'ERRO', listUrl, listResponse.status, { erro: 'Erro não recuperável' })
          break
        }
        // Para 429 ou 5xx, fetchWithRetry já tentou retry, então parar aqui
        logBlingRequest('fetchAllBlingContacts', 'ERRO', listUrl, listResponse.status, { erro: 'Erro após retries' })
        break
      }

      const listData = await listResponse.json().catch(() => null)
      const contacts = parseBlingContactsList(listData)
      
      
      // Parar quando lista vazia (fim dos resultados)
      if (contacts.length === 0) {
        logBlingRequest('fetchAllBlingContacts', 'FIM', listUrl, listResponse.status, { fimResultados: true, paginas: page - 1 })
        break
      }

      // Normalizar e adicionar contatos
      for (const c of contacts) {
        if (allContacts.length >= maxContacts) break
        
        if (typeof c === 'object' && c !== null) {
          const contact = c as Record<string, unknown>
          
          // Extrair campos básicos
          const id = contact.id != null ? Number(contact.id) : null
          if (id == null || isNaN(id)) continue

          const nome = String(contact.nome || contact.name || 'Sem nome').trim()
          const numeroDocumento = getContactDocumentDigits(contact)
          
          // Extrair contatos (e-mail de nível raiz, tiposContato ou pessoaFisica)
          const email = getContactEmail(contact)
          const celular = contact.celular ? String(contact.celular).trim() || null : null
          const telefone = contact.telefone ? String(contact.telefone).trim() || null : null

          // Extrair endereço usando função auxiliar que trata todos os formatos possíveis
          const endereco = extractBlingAddress(contact)

          allContacts.push({
            id,
            nome,
            numeroDocumento,
            email,
            celular,
            telefone,
            endereco,
          })
        }
      }

      // Se há limite pequeno (ex: teste com 5 contatos), buscar detalhes completos incluindo endereço
      // A listagem não retorna endereços, então precisamos fazer GET /contatos/{id} para cada um
      if (maxContacts && maxContacts <= 10 && allContacts.length > 0) {
        const enrichedContacts: BlingContactForImport[] = []
        
        for (const contact of allContacts) {
          try {
            // Delay entre requisições para respeitar rate limit
            if (enrichedContacts.length > 0) {
              await new Promise(resolve => setTimeout(resolve, delayBetweenRequests))
            }

            const detailUrl = `${BLING_API_BASE}/contatos/${contact.id}`
            const detailResponse = await fetchWithRetry(detailUrl, { method: 'GET', headers })
            
            if (detailResponse.ok) {
              const detailData = await detailResponse.json().catch(() => null)
              const detailContact = detailData?.data || detailData
              
              if (detailContact && typeof detailContact === 'object') {
                const dc = detailContact as Record<string, unknown>
                
                // Extrair endereço usando função auxiliar que trata todos os formatos (incluindo endereco.geral e endereco.cobranca)
                const endereco = extractBlingAddress(dc)

                // Atualizar email e telefones também (podem estar mais completos no detalhe)
                const detailEmail = getContactEmail(dc)
                const detailCelular = dc.celular ? String(dc.celular).trim() || null : null
                const detailTelefone = dc.telefone ? String(dc.telefone).trim() || null : null

                enrichedContacts.push({
                  ...contact,
                  email: detailEmail || contact.email,
                  celular: detailCelular || contact.celular,
                  telefone: detailTelefone || contact.telefone,
                  endereco,
                })
              } else {
                // Se não conseguir parsear detalhes, manter contato original
                enrichedContacts.push(contact)
              }
            } else {
              // Se falhar ao buscar detalhes, manter contato original
              console.warn(`[Bling] Erro ao buscar detalhes do contato ${contact.id}: ${detailResponse.status}`)
              enrichedContacts.push(contact)
            }
          } catch (err) {
            console.warn(`[Bling] Erro ao buscar detalhes do contato ${contact.id}:`, err)
            enrichedContacts.push(contact)
          }
        }

        // Substituir contatos originais pelos enriquecidos
        allContacts.length = 0
        allContacts.push(...enrichedContacts)
      }

      // Log periódico a cada 10 páginas
      if (page % 10 === 0) {
        logBlingRequest('fetchAllBlingContacts', 'PROGRESSO', listUrl, listResponse.status, {
          progresso: `${page} páginas, ${allContacts.length} contatos coletados`
        })
      }
    } catch (err) {
      console.warn(`[Bling] Erro ao buscar contatos (página ${page}):`, err)
      logBlingRequest('fetchAllBlingContacts', 'EXCEPTION', `${BLING_API_BASE}/contatos?pagina=${page}...`, null, { erro: String(err) })
      if (page === 1) break // Se falhar na primeira página, não continuar
    }
  }

  logBlingRequest('fetchAllBlingContacts', 'CONCLUIDO', 'Busca finalizada', null, {
    totalContatos: allContacts.length,
    paginasVerificadas: Math.min(maxPages, allContacts.length > 0 ? Math.ceil(allContacts.length / limit) : 0)
  })

  return allContacts
}

/**
 * Busca detalhes completos de um contato específico do Bling por ID.
 * Retorna dados completos incluindo email e endereço (que não vêm na listagem).
 * 
 * @param contactId ID do contato no Bling
 * @param accessToken Token de acesso do Bling
 * @returns Contato completo ou null se não encontrado ou houver erro
 */
export async function fetchBlingContactDetail(
  contactId: number,
  accessToken: string
): Promise<BlingContactForImport | null> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token || !contactId) {
    return null
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }

  try {
    const detailUrl = `${BLING_API_BASE}/contatos/${contactId}`
    const detailResponse = await fetchWithRetry(detailUrl, { method: 'GET', headers })
    
    if (!detailResponse.ok) {
      console.warn(`[Bling] Erro ao buscar detalhes do contato ${contactId}: ${detailResponse.status}`)
      return null
    }

    const detailData = await detailResponse.json().catch(() => null)
    const detailContact = detailData?.data || detailData
    
    if (!detailContact || typeof detailContact !== 'object') {
      return null
    }

    const dc = detailContact as Record<string, unknown>
    
    // Extrair campos básicos
    const id = dc.id != null ? Number(dc.id) : null
    if (id == null || isNaN(id)) {
      return null
    }

    const nome = String(dc.nome || dc.name || 'Sem nome').trim()
    const numeroDocumento = getContactDocumentDigits(dc)
    
    // Extrair email e telefones usando funções auxiliares
    const email = getContactEmail(dc)
    const celular = dc.celular ? String(dc.celular).trim() || null : null
    const telefone = dc.telefone ? String(dc.telefone).trim() || null : null

    // Extrair endereço usando função auxiliar que trata todos os formatos
    const endereco = extractBlingAddress(dc)

    return {
      id,
      nome,
      numeroDocumento,
      email,
      celular,
      telefone,
      endereco,
    }
  } catch (err) {
    console.warn(`[Bling] Erro ao buscar detalhes do contato ${contactId}:`, err)
    return null
  }
}

/**
 * Busca um contato no Bling por CPF/CNPJ usando filtro numeroDocumento.
 * Estratégia A: busca direta por documento.
 * Retorna o id do primeiro contato encontrado ou null se não encontrar.
 * Normaliza numeroDocumento sempre para "apenas dígitos" antes de comparar.
 */
async function findBlingContactByDocument(
  cleanCpf: string,
  accessToken: string
): Promise<number | null> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token || !cleanCpf) return null

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }

  try {
    const searchUrl = `${BLING_API_BASE}/contatos?numeroDocumento=${encodeURIComponent(cleanCpf)}`
    const response = await fetchWithRetry(searchUrl, { method: 'GET', headers })
    
    logBlingRequest('Busca por numeroDocumento', 'GET', searchUrl, response.status)

    if (response.ok) {
      const searchData = await response.json().catch(() => null)
      const contacts = parseBlingContactsList(searchData)
      const count = contacts.length
      
      for (const c of contacts) {
        if (typeof c === 'object' && c !== null) {
          const contact = c as Record<string, unknown>
          const contactDoc = getContactDocumentDigits(contact)
          // Comparar sempre com documento normalizado (apenas dígitos)
          if (contactDoc === cleanCpf && contact.id != null) {
            logBlingRequest('Busca por numeroDocumento', 'GET', searchUrl, response.status, { encontrado: true, id: contact.id })
            return Number(contact.id)
          }
        }
      }
      
      logBlingRequest('Busca por numeroDocumento', 'GET', searchUrl, response.status, { encontrados: count, match: false })
    } else {
      logBlingRequest('Busca por numeroDocumento', 'GET', searchUrl, response.status, { erro: 'Filtro pode não ser suportado' })
    }
  } catch (err) {
    console.warn('[Bling] Erro ao buscar contato por documento:', err)
    logBlingRequest('Busca por numeroDocumento', 'GET', `${BLING_API_BASE}/contatos?numeroDocumento=...`, null, { erro: String(err) })
  }

  return null
}

/**
 * Busca um contato no Bling por termo/pesquisa usando CPF/CNPJ como termo de busca.
 * Estratégia B: busca por pesquisa/termo (fallback quando filtro direto não funciona).
 * Tenta diferentes parâmetros de pesquisa comuns (termo, pesquisa, q, search).
 * Retorna o id do primeiro contato cujo numeroDocumento corresponde ao cleanCpf.
 */
async function findBlingContactBySearch(
  cleanCpf: string,
  accessToken: string
): Promise<number | null> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token || !cleanCpf) return null

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }

  // Tentar diferentes parâmetros de pesquisa comuns na API Bling v3
  const searchParams = ['termo', 'pesquisa', 'q', 'search']
  
  for (const param of searchParams) {
    try {
      const searchUrl = `${BLING_API_BASE}/contatos?${param}=${encodeURIComponent(cleanCpf)}`
      const response = await fetchWithRetry(searchUrl, { method: 'GET', headers })
      
      logBlingRequest(`Busca por pesquisa (${param})`, 'GET', searchUrl, response.status)

      if (response.ok) {
        const searchData = await response.json().catch(() => null)
        const contacts = parseBlingContactsList(searchData)
        const count = contacts.length
        
        for (const c of contacts) {
          if (typeof c === 'object' && c !== null) {
            const contact = c as Record<string, unknown>
            const contactDoc = getContactDocumentDigits(contact)
            // Comparar sempre com documento normalizado (apenas dígitos)
            if (contactDoc === cleanCpf && contact.id != null) {
              logBlingRequest(`Busca por pesquisa (${param})`, 'GET', searchUrl, response.status, { encontrado: true, id: contact.id })
              return Number(contact.id)
            }
          }
        }
        
        logBlingRequest(`Busca por pesquisa (${param})`, 'GET', searchUrl, response.status, { encontrados: count, match: false })
      } else if (response.status === 400 || response.status === 422) {
        // Parâmetro não suportado, tentar próximo
        logBlingRequest(`Busca por pesquisa (${param})`, 'GET', searchUrl, response.status, { erro: 'Parâmetro não suportado' })
        continue
      } else {
        // Outro erro, parar tentativas
        break
      }
    } catch (err) {
      console.warn(`[Bling] Erro ao buscar contato por pesquisa (${param}):`, err)
      logBlingRequest(`Busca por pesquisa (${param})`, 'GET', `${BLING_API_BASE}/contatos?${param}=...`, null, { erro: String(err) })
    }
  }

  return null
}

/**
 * Busca um contato no Bling por paginação com parada inteligente.
 * Estratégia C: busca paginada (último recurso quando filtros não funcionam).
 * Para quando lista vazia (fim dos resultados), não por limite fixo de páginas.
 * Respeita limite de 3 requisições/segundo do Bling com delay de 350ms.
 */
async function findBlingContactByPagination(
  cleanCpf: string,
  accessToken: string,
  maxPages: number = 100,
  timeoutMs: number = 60000
): Promise<number | null> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token || !cleanCpf) return null

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }

  const limit = 100
  const delayBetweenRequests = 350 // ms - garante < 3 req/s (limite da API)
  const startTime = Date.now()
  let pagesChecked = 0
  let totalContactsChecked = 0

  for (let page = 1; page <= maxPages; page++) {
    // Parar se timeout atingido
    if (Date.now() - startTime > timeoutMs) {
      console.warn(`[Bling] Timeout na busca paginada após ${pagesChecked} páginas (${totalContactsChecked} contatos verificados)`)
      logBlingRequest('Busca paginada', 'GET', `${BLING_API_BASE}/contatos?pagina=...`, null, { timeout: true, paginas: pagesChecked })
      break
    }

    try {
      // Delay antes de cada requisição (exceto a primeira)
      if (page > 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests))
      }

      const listUrl = `${BLING_API_BASE}/contatos?pagina=${page}&limite=${limit}`
      const listResponse = await fetchWithRetry(listUrl, { method: 'GET', headers })
      
      if (!listResponse.ok) {
        // Parar se erro não recuperável (4xx que não seja 429)
        if (listResponse.status >= 400 && listResponse.status < 500 && listResponse.status !== 429) {
          logBlingRequest('Busca paginada', 'GET', listUrl, listResponse.status, { erro: 'Erro não recuperável' })
          break
        }
        // Para 429 ou 5xx, fetchWithRetry já tentou retry, então parar aqui
        logBlingRequest('Busca paginada', 'GET', listUrl, listResponse.status, { erro: 'Erro após retries' })
        break
      }

      const listData = await listResponse.json().catch(() => null)
      const contacts = parseBlingContactsList(listData)
      
      // Parar quando lista vazia (fim dos resultados)
      if (contacts.length === 0) {
        logBlingRequest('Busca paginada', 'GET', listUrl, listResponse.status, { fimResultados: true, paginas: pagesChecked })
        break
      }

      pagesChecked++
      totalContactsChecked += contacts.length

      for (const c of contacts) {
        if (typeof c === 'object' && c !== null) {
          const contact = c as Record<string, unknown>
          const contactDoc = getContactDocumentDigits(contact)
          // Comparar sempre com documento normalizado (apenas dígitos)
          if (contactDoc === cleanCpf && contact.id != null) {
            logBlingRequest('Busca paginada', 'GET', listUrl, listResponse.status, {
              encontrado: true,
              id: contact.id,
              pagina: page,
              contatosVerificados: totalContactsChecked
            })
            return Number(contact.id)
          }
        }
      }

      // Log periódico a cada 10 páginas
      if (page % 10 === 0) {
        logBlingRequest('Busca paginada', 'GET', listUrl, listResponse.status, {
          progresso: `${page} páginas, ${totalContactsChecked} contatos verificados`
        })
      }
    } catch (err) {
      console.warn(`[Bling] Erro na busca paginada (página ${page}):`, err)
      logBlingRequest('Busca paginada', 'GET', `${BLING_API_BASE}/contatos?pagina=${page}...`, null, { erro: String(err) })
      if (page === 1) break // Se falhar na primeira página, não continuar
    }
  }

  logBlingRequest('Busca paginada', 'GET', `${BLING_API_BASE}/contatos?pagina=...`, null, {
    finalizado: true,
    paginas: pagesChecked,
    contatosVerificados: totalContactsChecked,
    encontrado: false
  })

  return null
}

/**
 * Interface para resultado de busca de contato com estratégia usada.
 */
interface ContactSearchResult {
  id: number | null
  strategy: 'documento' | 'pesquisa' | 'paginacao' | null
  attempts: number
}

/**
 * Busca contato no Bling usando múltiplas estratégias em ordem de prioridade.
 * Orquestra as três estratégias: A (numeroDocumento) → B (pesquisa) → C (paginação).
 * Retorna resultado com estratégia que encontrou e número de tentativas.
 */
async function findBlingContactWithFallback(
  cleanCpf: string,
  accessToken: string
): Promise<ContactSearchResult> {
  let attempts = 0

  // Estratégia A: Busca por numeroDocumento
  attempts++
  logBlingRequest('findBlingContactWithFallback', 'INICIO', 'Busca contato', null, { estrategia: 'A: numeroDocumento', cpf: maskSensitiveData(cleanCpf) })
  const foundByDocument = await findBlingContactByDocument(cleanCpf, accessToken)
  if (foundByDocument != null) {
    logBlingRequest('findBlingContactWithFallback', 'SUCESSO', 'Busca contato', null, { estrategia: 'A: numeroDocumento', id: foundByDocument })
    return { id: foundByDocument, strategy: 'documento', attempts }
  }

  // Estratégia B: Busca por pesquisa/termo
  attempts++
  logBlingRequest('findBlingContactWithFallback', 'CONTINUA', 'Busca contato', null, { estrategia: 'B: pesquisa' })
  const foundBySearch = await findBlingContactBySearch(cleanCpf, accessToken)
  if (foundBySearch != null) {
    logBlingRequest('findBlingContactWithFallback', 'SUCESSO', 'Busca contato', null, { estrategia: 'B: pesquisa', id: foundBySearch })
    return { id: foundBySearch, strategy: 'pesquisa', attempts }
  }

  // Estratégia C: Busca paginada
  attempts++
  logBlingRequest('findBlingContactWithFallback', 'CONTINUA', 'Busca contato', null, { estrategia: 'C: paginação' })
  const foundByPagination = await findBlingContactByPagination(cleanCpf, accessToken)
  if (foundByPagination != null) {
    logBlingRequest('findBlingContactWithFallback', 'SUCESSO', 'Busca contato', null, { estrategia: 'C: paginação', id: foundByPagination })
    return { id: foundByPagination, strategy: 'paginacao', attempts }
  }

  logBlingRequest('findBlingContactWithFallback', 'FALHA', 'Busca contato', null, { tentativas: attempts, encontrado: false })
  return { id: null, strategy: null, attempts }
}

/**
 * Retorna a mensagem de erro extraída do body da resposta Bling (message ou error.message).
 */
function getBlingErrorMessage(responseData: unknown): string {
  if (responseData && typeof responseData === 'object' && 'error' in responseData) {
    const err = (responseData as { error?: { message?: string } }).error
    if (err?.message) return decodeUnicodeEscapes(err.message)
  }
  if (responseData && typeof responseData === 'object' && 'message' in responseData) {
    return decodeUnicodeEscapes((responseData as { message: string }).message)
  }
  return ''
}

/**
 * Busca agressiva de contato no Bling quando sabemos que ele existe mas não foi encontrado.
 * Tenta múltiplas estratégias: busca por documento com retry, busca paginada expandida,
 * e variações do documento (com/sem zeros à esquerda).
 */
async function findBlingContactAggressively(
  cleanCpf: string,
  clientName: string,
  accessToken: string
): Promise<number | null> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token || !cleanCpf) return null


  // Estratégia 1: Busca por documento
  const foundById = await findBlingContactByDocument(cleanCpf, accessToken)
  if (foundById != null) {
    return foundById
  }

  // Estratégia 2: Tentar variações do documento (com zeros à esquerda para CPF)
  if (cleanCpf.length === 11) {
    // CPF: tentar com zeros à esquerda (ex: 12345678901 -> 01234567890)
    const paddedCpf = cleanCpf.padStart(11, '0')
    if (paddedCpf !== cleanCpf) {
      const foundPadded = await findBlingContactByDocument(paddedCpf, accessToken)
      if (foundPadded != null) {
        return foundPadded
      }
    }
  }

  // Estratégia 3: Busca paginada expandida com timeout maior (até 60s total)
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }

  const maxPages = 50 // Aumentado de 20 para 50 para aumentar chances de encontrar o contato
  const limit = 100
  const startTime = Date.now()
  const maxTime = 60000 // 60 segundos (aumentado de 30s para acomodar mais páginas)
  const delayBetweenRequests = 350 // ms - garante < 3 req/s (limite da API)

  let pagesChecked = 0
  for (let page = 1; page <= maxPages; page++) {
    if (Date.now() - startTime > maxTime) {
      console.warn(`[Bling] Timeout na busca agressiva após ${pagesChecked} páginas (${pagesChecked * limit} contatos verificados)`)
      break
    }

    try {
      // Delay antes de cada requisição (exceto a primeira)
      if (page > 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests))
      }

      const listUrl = `${BLING_API_BASE}/contatos?pagina=${page}&limite=${limit}`
      const listResponse = await fetchWithRetry(listUrl, { method: 'GET', headers })
      if (!listResponse.ok) {
        console.warn(`[Bling] Erro HTTP ${listResponse.status} ao buscar página ${page}`)
        break
      }

      const listData = await listResponse.json().catch(() => null)
      const contacts = parseBlingContactsList(listData)
      if (contacts.length === 0) {
        break
      }

      pagesChecked++
      for (const c of contacts) {
        if (typeof c === 'object' && c !== null) {
          const contact = c as Record<string, unknown>
          const contactDoc = getContactDocumentDigits(contact)
          // Se o documento bate, retornar o ID (documento é único)
          if (contactDoc === cleanCpf && contact.id != null) {
            return Number(contact.id)
          }
        }
      }
    } catch (err) {
      console.warn(`[Bling] Erro na busca agressiva (página ${page}):`, err)
      if (page === 1) break
    }
  }

  console.warn(`[Bling] Contato não encontrado após busca agressiva: CPF ${cleanCpf}, ${pagesChecked} páginas verificadas (${pagesChecked * limit} contatos)`)
  return null
}

/**
 * Verifica se a resposta indica que o contato já está cadastrado no Bling.
 * Inclui a mensagem "não foi possível salvar o contato" pois o Bling pode devolver
 * apenas isso quando o CPF já está cadastrado (sem a frase "já cadastrado").
 */
function isAlreadyRegisteredError(responseStatus: number, responseData: unknown): boolean {
  if (responseStatus === 409) return true
  if (responseStatus === 422) {
    // 422 Unprocessable Entity pode indicar validação de duplicata
    const msg = getBlingErrorMessage(responseData).toLowerCase()
    if (msg.includes('cadastrado') || msg.includes('existe') || msg.includes('duplicat')) {
      return true
    }
  }
  if (responseData && typeof responseData === 'object' && 'error' in responseData) {
    const msg = getBlingErrorMessage(responseData).toLowerCase()
    if (msg.includes('cadastrado') || msg.includes('existe') || msg.includes('duplicat')) {
      return true
    }
  }
  const msg = getBlingErrorMessage(responseData).toLowerCase()
  return (
    responseStatus >= 400 &&
    responseStatus < 500 &&
    (msg.includes('já cadastrado') ||
      msg.includes('já está cadastrado') ||
      msg.includes('cpf já cadastrado') ||
      msg.includes('cnpj já cadastrado') ||
      msg.includes('documento já existe') ||
      msg.includes('não foi possível salvar o contato') ||
      msg.includes('contato já existe'))
  )
}

/**
 * Resultado da busca/criação de contato no Bling.
 */
interface ContactResult {
  id: number | null
  found: boolean
  created: boolean
  strategy?: 'documento' | 'pesquisa' | 'paginacao' | null
  attempts?: number
}

/**
 * Cria ou busca um contato no Bling usando os dados do pedido.
 * Retorna o ID do contato criado/encontrado no Bling, ou null se o contato existe mas não foi encontrado.
 * 
 * IMPORTANTE: Requer escopo de Contatos no app Bling (OAuth).
 * Se o token não tiver permissão para criar contatos, esta função falhará.
 * O usuário deve garantir que o escopo de Contatos está selecionado no painel do Bling
 * e reautorizar o app se necessário.
 */
/**
 * Cria ou obtém ID de contato no Bling usando os dados do pedido.
 * Fluxo unificado: busca primeiro (A→B→C), se não encontrar tenta criar, se criação falhar por duplicidade refaz busca completa.
 * 
 * IMPORTANTE: Requer escopo de Contatos no app Bling (OAuth).
 * Se o token não tiver permissão para criar contatos, esta função falhará.
 * O usuário deve garantir que o escopo de Contatos está selecionado no painel do Bling
 * e reautorize o app se necessário.
 */
async function createOrGetContactId(
  order: OrderForBling,
  accessToken: string
): Promise<ContactResult> {
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) {
    throw new Error('[Sistema] Token Bling não configurado.')
  }

  const cleanCpf = (order.client_cpf || '').replace(/\D/g, '')
  if (!cleanCpf) {
    throw new Error('[Sistema] CPF/CNPJ do cliente é obrigatório para criar contato no Bling.')
  }

  logBlingRequest('createOrGetContactId', 'INICIO', 'Criar/obter contato', null, { cpf: maskSensitiveData(cleanCpf) })

  // Passo 1: Buscar primeiro usando todas as estratégias (A → B → C)
  const searchResult = await findBlingContactWithFallback(cleanCpf, accessToken)
  if (searchResult.id != null) {
    logBlingRequest('createOrGetContactId', 'SUCESSO', 'Contato encontrado', null, {
      id: searchResult.id,
      strategy: searchResult.strategy,
      attempts: searchResult.attempts
    })
    return {
      id: searchResult.id,
      found: true,
      created: false,
      strategy: searchResult.strategy,
      attempts: searchResult.attempts
    }
  }

  // Passo 2: Não encontrou, tentar criar
  logBlingRequest('createOrGetContactId', 'CRIAR', 'Tentando criar contato', null, { cpf: maskSensitiveData(cleanCpf) })
  
  const tipo = cleanCpf.length === 11 ? 'F' : 'J'
  const contactPayload: Record<string, unknown> = {
    nome: order.client_name || 'Cliente',
    numeroDocumento: cleanCpf,
    tipo,
  }

  if (order.client_email) contactPayload.email = order.client_email
  if (order.client_whatsapp) contactPayload.celular = order.client_whatsapp
  if (order.client_phone) contactPayload.telefone = order.client_phone

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
    const response = await fetchWithRetry(url, {
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

    logBlingRequest('createOrGetContactId', 'POST', url, response.status, responseData)

    if (response.ok) {
      const contactId = extractBlingIdFromResponse(responseData)
      if (contactId != null) {
        logBlingRequest('createOrGetContactId', 'SUCESSO', 'Contato criado', response.status, { id: contactId })
        return {
          id: Number(contactId),
          found: true,
          created: true,
          strategy: null,
          attempts: searchResult.attempts + 1
        }
      }
      throw new Error('Resposta do Bling não contém ID do contato criado.')
    }

    // Passo 3: Se criação falhou por duplicidade, refazer busca completa
    if (isAlreadyRegisteredError(response.status, responseData)) {
      const errorMsg = getBlingErrorMessage(responseData) || response.statusText
      logBlingRequest('createOrGetContactId', 'DUPLICIDADE', 'Criação falhou, refazendo busca', response.status, {
        erro: errorMsg,
        refazendoBusca: true
      })
      
      // Refazer busca completa (A+B+C) após erro de duplicidade
      const retrySearchResult = await findBlingContactWithFallback(cleanCpf, accessToken)
      if (retrySearchResult.id != null) {
        logBlingRequest('createOrGetContactId', 'SUCESSO', 'Contato encontrado após duplicidade', null, {
          id: retrySearchResult.id,
          strategy: retrySearchResult.strategy,
          attempts: searchResult.attempts + retrySearchResult.attempts + 1
        })
        return {
          id: retrySearchResult.id,
          found: true,
          created: false,
          strategy: retrySearchResult.strategy,
          attempts: searchResult.attempts + retrySearchResult.attempts + 1
        }
      }

      // Não encontrou após refazer busca - erro explícito com detalhes
      const totalAttempts = searchResult.attempts + retrySearchResult.attempts + 1
      const strategiesTried = [
        searchResult.strategy ? `busca inicial (${searchResult.strategy})` : null,
        retrySearchResult.strategy ? `busca após duplicidade (${retrySearchResult.strategy})` : null
      ].filter(Boolean).join(', ') || 'todas as estratégias'

      throw new Error(
        `Contato com CPF/CNPJ ${maskSensitiveData(cleanCpf)} já existe no Bling mas não foi possível obter o ID após ${totalAttempts} tentativas. ` +
        `Estratégias tentadas: ${strategiesTried}. ` +
        `Verifique se o app Bling tem escopo 'Gerenciar Contatos' (ID: 318257565) habilitado e reautorize a integração se necessário. ` +
        `Erro original do Bling: ${errorMsg}`
      )
    }

    // Outros erros de criação
    const errMsg = getBlingErrorMessage(responseData) || `Erro HTTP ${response.status}.`
    const snippet = decodeUnicodeEscapes(responseText.trim().slice(0, 300))
    logBlingRequest('createOrGetContactId', 'ERRO', 'Falha ao criar contato', response.status, { erro: errMsg })
    throw new Error(`Não foi possível criar contato no Bling: ${errMsg}${snippet ? `. Detalhes: ${snippet}` : ''}`)
  } catch (err: unknown) {
    if (err instanceof Error) {
      logBlingRequest('createOrGetContactId', 'EXCEPTION', 'Exceção ao criar/obter contato', null, { erro: err.message })
      throw err
    }
    throw new Error(`Erro ao criar contato no Bling: ${String(err)}`)
  }
}

/**
 * Alias para compatibilidade com código existente.
 * @deprecated Use createOrGetContactId
 */
async function createOrFindContactInBling(
  order: OrderForBling,
  accessToken: string
): Promise<ContactResult> {
  return createOrGetContactId(order, accessToken)
}

/**
 * Monta o payload para POST /pedidos/vendas conforme estrutura esperada pela API Bling v3.
 * @param order Dados do pedido
 * @param blingContactId ID do contato no Bling (obrigatório na API v3). Deve ser fornecido sempre.
 * @param numeroBling Número da venda no Bling (único por conta). Não usar order.id para evitar conflito com vendas já existentes.
 * @throws Error se blingContactId não for fornecido
 */
export function mapOrderToBlingSale(order: OrderForBling, blingContactId?: number | null, numeroBling?: string): Record<string, unknown> {
  if (blingContactId == null || blingContactId === undefined) {
    throw new Error('ID do contato é obrigatório para criar pedido no Bling. O contato deve ser criado/encontrado antes de criar a venda.')
  }

  const numero = numeroBling != null && numeroBling.trim() !== '' ? numeroBling.trim() : String(order.id)
  const dataEmissao = order.created_at ? order.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)

  // API v3 exige contato.id sempre
  const contato: Record<string, unknown> = { id: blingContactId }

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
      valorFrete: Number(order.total_shipping) || 0,
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

  // Se o cliente já tem bling_contact_id (foi importado do Bling), usar diretamente
  let blingContactId: number | null = null
  if (order.client_bling_contact_id != null) {
    blingContactId = order.client_bling_contact_id
    logBlingRequest('sendOrderToBling', 'CONTATO', 'Usando bling_contact_id do cliente', null, {
      id: blingContactId,
      source: 'imported'
    })
  } else {
    // Criar ou buscar contato no Bling antes de criar a venda (API v3 exige contato.id)
    let contactResult: ContactResult
    try {
      contactResult = await createOrGetContactId(order, accessToken)
      logBlingRequest('sendOrderToBling', 'CONTATO', 'Contato obtido', null, {
        id: contactResult.id,
        strategy: contactResult.strategy,
        created: contactResult.created
      })
    } catch (contactErr: unknown) {
      const contactErrorMsg = contactErr instanceof Error ? contactErr.message : String(contactErr)
      logBlingRequest('sendOrderToBling', 'ERRO', 'Falha ao obter contato', null, { erro: contactErrorMsg })
      await updateOrderSync(orderId, 'error', contactErrorMsg)
      await insertLog(orderId, 'error', contactErrorMsg, null)
      return { success: false, error: `[Bling] Não foi possível cadastrar o cliente no Bling. ${contactErrorMsg}` }
    }

    // Validar que temos o ID do contato antes de criar a venda
    // A API v3 não aceita dados inline quando o contato já existe no sistema
    if (contactResult.id === null) {
      const errorMsg = 'Não foi possível obter ID do contato no Bling. O contato pode já existir mas não foi encontrado após todas as tentativas de busca. ' +
        'Verifique se o app Bling tem o escopo "Gerenciar Contatos" (ID: 318257565) habilitado e reautorize a integração se necessário. ' +
        'Se o problema persistir, verifique se o CPF/CNPJ do cliente está correto e se o contato existe na conta Bling correta.'
      await updateOrderSync(orderId, 'error', errorMsg)
      await insertLog(orderId, 'error', errorMsg, null)
      return { success: false, error: `[Bling] ${errorMsg}` }
    }

    blingContactId = contactResult.id

    // Opcionalmente, atualizar o cliente com o bling_contact_id para próximos pedidos
    // (apenas se foi criado/encontrado agora e não tinha antes)
    if (contactResult.found && blingContactId != null) {
      try {
        const cleanDoc = order.client_cpf.replace(/\D/g, '')
        const docLength = cleanDoc.length
        
        // Determinar se é CPF (11 dígitos) ou CNPJ (14 dígitos)
        if (docLength === 11) {
          // CPF: atualizar usando coluna cpf
          await query(
            'UPDATE clients SET bling_contact_id = $1, updated_at = CURRENT_TIMESTAMP WHERE cpf = $2 AND bling_contact_id IS NULL',
            [blingContactId, cleanDoc]
          )
        } else if (docLength === 14) {
          // CNPJ: atualizar usando coluna cnpj
          await query(
            'UPDATE clients SET bling_contact_id = $1, updated_at = CURRENT_TIMESTAMP WHERE cnpj = $2 AND bling_contact_id IS NULL',
            [blingContactId, cleanDoc]
          )
        } else {
          // Documento inválido: não atualizar
          console.warn(`[Bling] Não foi possível atualizar bling_contact_id: documento com tamanho inválido (${docLength} dígitos)`)
        }
      } catch (err) {
        // Não falhar o envio se a atualização do cliente falhar
        console.warn('[Bling] Erro ao atualizar bling_contact_id do cliente:', err)
      }
    }
  }

  // Número único da venda no Bling: reutilizar o já salvo ou gerar novo (evita conflito com numeros já existentes na conta)
  const numeroBling = order.bling_sale_numero?.trim() || generateBlingSaleNumero()
  const payload = mapOrderToBlingSale(order, blingContactId, numeroBling)
  const url = `${BLING_API_BASE}/pedidos/vendas`

  let syncedInThisRun = false
  try {
    logBlingRequest('sendOrderToBling', 'POST', url, null, { pedidoId: orderId, contatoId: blingContactId })
    const response = await fetchWithRetry(url, {
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

    logBlingRequest('sendOrderToBling', 'POST', url, response.status, responseData)

    if (response.ok) {
      const blingId = extractBlingIdFromResponse(responseData)
      logBlingRequest('sendOrderToBling', 'SUCESSO', 'Pedido enviado', response.status, { blingId, numeroBling })
      await updateOrderSync(orderId, 'synced', null)
      syncedInThisRun = true
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
    if (!syncedInThisRun) {
      await updateOrderSync(orderId, 'error', message)
      await insertLog(orderId, 'error', message, null)
    }
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
            c.whatsapp as client_whatsapp, c.phone as client_phone, c.bling_contact_id as client_bling_contact_id
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
              c.whatsapp as client_whatsapp, c.phone as client_phone, c.bling_contact_id as client_bling_contact_id
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
    client_bling_contact_id: row.client_bling_contact_id != null ? Number(row.client_bling_contact_id) : null,
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
  const tokenValue = await getTokenWithFallback('bling', 'production')
  if (!tokenValue) {
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
    tokenValue,
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
    const response = await fetchWithRetry(url, {
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
    const response = await fetchWithRetry(url, {
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

    // Buscar antes de criar usando todas as estratégias (A→B→C)
    const searchResult = await findBlingContactWithFallback(cleanCpf, accessToken)
    if (searchResult.id != null) {
      syncedCount++
      continue
    }

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
    const response = await fetchWithRetry(url, {
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
      const responseData = (() => {
        try {
          return responseText ? JSON.parse(responseText) : null
        } catch {
          return null
        }
      })()
      // Se o erro for "já cadastrado", tentar buscar novamente com todas as estratégias
      if (isAlreadyRegisteredError(response.status, responseData)) {
        const retrySearchResult = await findBlingContactWithFallback(cleanCpf, accessToken)
        if (retrySearchResult.id != null) {
          syncedCount++
          continue
        }
      }
      return { success: false, syncedCount, error: buildBlingError(responseText, response) }
    }
    syncedCount++
  }
  await upsertBlingSyncStatus('contacts')
  return { success: true, syncedCount }
}

export async function syncOrdersToBling(sinceDate: string, accessToken: string): Promise<BlingSyncResult> {
  // Verificar token uma vez antes de processar todos os pedidos
  const tokenValue = await getTokenWithFallback('bling', 'production')
  if (!tokenValue) {
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
