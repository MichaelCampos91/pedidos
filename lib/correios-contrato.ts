import { getToken, type IntegrationEnvironment } from './integrations'
import type { ShippingOption } from './shipping-rules'

const CORREIOS_PRECO_BASES: Record<IntegrationEnvironment, string> = {
  sandbox: 'https://apihom.correios.com.br/preco/v1',
  production: 'https://api.correios.com.br/preco/v1',
}

const CORREIOS_PRAZO_BASES: Record<IntegrationEnvironment, string> = {
  sandbox: 'https://apihom.correios.com.br/prazo/v1',
  production: 'https://api.correios.com.br/prazo/v1',
}

export interface CorreiosQuoteParams {
  from: {
    postal_code: string
  }
  to: {
    postal_code: string
  }
  products: Array<{
    width: number
    height: number
    length: number
    weight: number // kg
    insurance_value: number
    quantity: number
  }>
}

interface CorreiosPrecoItem {
  coProduto: string
  pcFinal?: string
  psCobrado?: string
  [key: string]: any
}

interface CorreiosPrazoItem {
  coProduto: string
  prazoEntrega?: number | string
  dataMaxima?: string
  [key: string]: any
}

interface CorreiosServiceDef {
  code: string
  id: number
  name: string
  nuRequisicao: string
}

const CORREIOS_SERVICES: CorreiosServiceDef[] = [
  // IDs altos para evitar colisão com Melhor Envio
  { code: '03298', id: 9001, name: 'PAC',   nuRequisicao: '1' },
  { code: '03220', id: 9002, name: 'SEDEX', nuRequisicao: '2' },
]

function getPrecoBaseUrl(environment: IntegrationEnvironment): string {
  return CORREIOS_PRECO_BASES[environment] || CORREIOS_PRECO_BASES.production
}

function getPrazoBaseUrl(environment: IntegrationEnvironment): string {
  return CORREIOS_PRAZO_BASES[environment] || CORREIOS_PRAZO_BASES.production
}

async function getCorreiosAuthToken(environment: IntegrationEnvironment): Promise<string> {
  const token = await getToken('correios_contrato', environment)

  if (!token || !token.token_value) {
    throw new Error('[Correios] Token de contrato não configurado para este ambiente.')
  }

  const raw = token.token_value.trim()
  if (!raw) {
    throw new Error('[Correios] Token de contrato está vazio.')
  }

  return raw.replace(/^Bearer\s+/i, '')
}

function normalizeCep(value: string): string {
  return (value || '').replace(/\D/g, '')
}

function parsePrecoValue(pcFinal: string | undefined): number | null {
  if (!pcFinal) return null
  const normalized = pcFinal.replace('.', '').replace(',', '.')
  const n = Number(normalized)
  if (!isFinite(n) || isNaN(n) || n <= 0) return null
  return n
}

function formatPrice(value: number): string {
  return value.toFixed(2)
}

function aggregateProducts(products: CorreiosQuoteParams['products']): {
  totalWeightGrams: number
  maxLength: number
  maxWidth: number
  maxHeight: number
} {
  let totalWeightKg = 0
  let maxLength = 0
  let maxWidth = 0
  let maxHeight = 0

  for (const p of products) {
    const qty = Math.max(1, Number(p.quantity) || 1)
    const weight = Math.max(0.01, Number(p.weight) || 0.01) // kg
    totalWeightKg += weight * qty

    maxLength = Math.max(maxLength, Number(p.length) || 0)
    maxWidth = Math.max(maxWidth, Number(p.width) || 0)
    maxHeight = Math.max(maxHeight, Number(p.height) || 0)
  }

  const totalWeightGrams = Math.max(1, Math.round(totalWeightKg * 1000))

  // Correios exigem valores positivos em cm; se alguma dimensão vier 0, usar defaults seguros
  if (maxLength <= 0) maxLength = 20
  if (maxWidth <= 0) maxWidth = 20
  if (maxHeight <= 0) maxHeight = 20

  return { totalWeightGrams, maxLength, maxWidth, maxHeight }
}

/**
 * Calcula opções de frete usando o contrato direto dos Correios (PAC e SEDEX).
 * Retorna as opções já normalizadas no mesmo formato usado pelo sistema.
 */
export async function calculateCorreiosShipping(
  params: CorreiosQuoteParams,
  environment: IntegrationEnvironment = 'production'
): Promise<(ShippingOption & { source?: 'correios_contrato' })[]> {
  const cleanCepOrigem = normalizeCep(params.from.postal_code)
  const cleanCepDestino = normalizeCep(params.to.postal_code)

  if (cleanCepOrigem.length !== 8 || cleanCepDestino.length !== 8) {
    throw new Error('[Correios] CEP de origem ou destino inválido para cálculo de frete.')
  }

  if (!params.products || params.products.length === 0) {
    return []
  }

  const { totalWeightGrams, maxLength, maxWidth, maxHeight } = aggregateProducts(params.products)
  const token = await getCorreiosAuthToken(environment)

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  // Informações contratuais opcionais (nuContrato, nuDR) vindas do additional_data
  let nuContrato: string | undefined
  let nuDR: string | undefined
  try {
    const tokenRecord = await getToken('correios_contrato', environment)
    if (tokenRecord?.additional_data) {
      const data = tokenRecord.additional_data as any
      nuContrato = String(data.nuContrato ?? data.nu_contrato ?? '').trim() || undefined
      const nuDrRaw = data.nuDR ?? data.nu_dr ?? data.dr
      nuDR = nuDrRaw != null ? String(nuDrRaw).trim() || undefined : undefined
    }
  } catch {
    // Se falhar, apenas segue sem contrato explícito
  }

  const precoBody = {
    idLote: '01',
    parametrosProduto: CORREIOS_SERVICES.map((svc) => ({
      coProduto: svc.code,
      nuRequisicao: svc.nuRequisicao,
      cepOrigem: cleanCepOrigem,
      cepDestino: cleanCepDestino,
      psObjeto: String(totalWeightGrams),
      tpObjeto: '2', // Pacote
      comprimento: String(maxLength),
      largura: String(maxWidth),
      altura: String(maxHeight),
      ...(nuContrato
        ? {
            nuContrato,
            ...(nuDR ? { nuDR } : {}),
          }
        : {}),
    })),
  }

  const precoResponse = await fetch(`${getPrecoBaseUrl(environment)}/nacional`, {
    method: 'POST',
    headers,
    body: JSON.stringify(precoBody),
  })

  const precoText = await precoResponse.text().catch(() => '')
  let precoData: any = []
  if (precoText) {
    try {
      precoData = JSON.parse(precoText)
    } catch {
      throw new Error('[Correios][Preço] Resposta inválida da API de preços dos Correios.')
    }
  }

  if (!precoResponse.ok && precoResponse.status !== 206) {
    throw new Error(
      `[Correios][Preço] Erro ${precoResponse.status} ao consultar preços dos Correios.`
    )
  }

  const precoList: CorreiosPrecoItem[] = Array.isArray(precoData)
    ? precoData
    : precoData?.parametrosProduto || []

  const precoByCode = new Map<string, number>()
  for (const item of precoList) {
    if (!item || typeof item.coProduto !== 'string') continue
    const value = parsePrecoValue(item.pcFinal)
    if (value != null) {
      precoByCode.set(item.coProduto, value)
    }
  }

  // Se nenhum preço válido, não faz sentido consultar prazo
  if (precoByCode.size === 0) {
    return []
  }

  const hoje = new Date()
  const dataPostagem = hoje.toISOString().slice(0, 10) // AAAA-MM-DD

  const prazoBody = {
    idLote: '01',
    parametrosPrazo: CORREIOS_SERVICES.map((svc) => ({
      coProduto: svc.code,
      nuRequisicao: svc.nuRequisicao,
      cepOrigem: cleanCepOrigem,
      cepDestino: cleanCepDestino,
      dataPostagem,
    })),
  }

  const prazoResponse = await fetch(`${getPrazoBaseUrl(environment)}/nacional`, {
    method: 'POST',
    headers,
    body: JSON.stringify(prazoBody),
  })

  const prazoText = await prazoResponse.text().catch(() => '')
  let prazoData: any = []
  if (prazoText) {
    try {
      prazoData = JSON.parse(prazoText)
    } catch {
      // Se a API de prazo responder inválido, seguimos apenas com preço
      prazoData = []
    }
  }

  if (!prazoResponse.ok && prazoResponse.status !== 206) {
    // Não interromper totalmente em caso de falha de prazo; apenas logar implicitamente pela mensagem
    prazoData = []
  }

  const prazoList: CorreiosPrazoItem[] = Array.isArray(prazoData)
    ? prazoData
    : prazoData?.parametrosPrazo || []

  const prazoByCode = new Map<string, number>()
  for (const item of prazoList) {
    if (!item || typeof item.coProduto !== 'string') continue
    const rawPrazo = item.prazoEntrega
    const prazoNum = typeof rawPrazo === 'string' ? parseInt(rawPrazo, 10) : Number(rawPrazo)
    if (!isNaN(prazoNum) && prazoNum >= 0) {
      prazoByCode.set(item.coProduto, prazoNum)
    }
  }

  const options: (ShippingOption & { source?: 'correios_contrato' })[] = []

  for (const svc of CORREIOS_SERVICES) {
    const preco = precoByCode.get(svc.code)
    if (preco == null || !isFinite(preco) || preco <= 0) continue

    const prazo = prazoByCode.get(svc.code)
    const deliveryTime = prazo != null && prazo >= 0 ? prazo : 0

    const option: ShippingOption & { source?: 'correios_contrato' } = {
      id: svc.id,
      name: svc.name,
      company: {
        id: 1,
        name: 'Correios',
      },
      price: formatPrice(preco),
      currency: 'BRL',
      delivery_time: deliveryTime,
      delivery_range: deliveryTime
        ? {
            min: deliveryTime,
            max: deliveryTime,
          }
        : undefined,
      packages: 1,
      source: 'correios_contrato',
    }

    options.push(option)
  }

  return options
}

export async function validateToken(
  environment: IntegrationEnvironment = 'production'
): Promise<{ valid: boolean; message: string; details?: any }> {
  try {
    const cleanCepOrigem = '01001001'
    const cleanCepDestino = '01001001'

    const params: CorreiosQuoteParams = {
      from: { postal_code: cleanCepOrigem },
      to: { postal_code: cleanCepDestino },
      products: [
        {
          width: 20,
          height: 20,
          length: 20,
          weight: 0.3,
          insurance_value: 100,
          quantity: 1,
        },
      ],
    }

    const options = await calculateCorreiosShipping(params, environment)

    if (!options || options.length === 0) {
      return {
        valid: false,
        message:
          '[Correios] Token válido, mas nenhum serviço de PAC/SEDEX retornou preço para o cenário de teste.',
      }
    }

    return {
      valid: true,
      message: '[Correios] Token de contrato validado com sucesso.',
      details: {
        services: options.map((o) => ({ id: o.id, name: o.name, price: o.price })),
      },
    }
  } catch (error: any) {
    const msg = error?.message || 'Erro ao validar token dos Correios.'
    return {
      valid: false,
      message: `[Correios] ${msg}`,
    }
  }
}

