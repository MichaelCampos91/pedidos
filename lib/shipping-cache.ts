import type { ShippingOption } from './melhor-envio'
import type { IntegrationEnvironment } from './integrations-types'

interface CacheEntry {
  options: ShippingOption[]
  timestamp: number
  expiresAt: number
}

// Cache em memória (Map)
const cache = new Map<string, CacheEntry>()

// TTL padrão: 5 minutos
const DEFAULT_TTL = 5 * 60 * 1000

/**
 * Gera chave de cache baseada em CEP destino, produtos e ambiente
 */
export function generateCacheKey(
  cepDestino: string,
  products: Array<{ id: string; width: number; height: number; length: number; weight: number; insurance_value: number; quantity: number }>,
  environment: IntegrationEnvironment
): string {
  const productsHash = products
    .map(p => `${p.id}:${p.width}x${p.height}x${p.length}:${p.weight}:${p.insurance_value}:${p.quantity}`)
    .join('|')
  
  return `shipping:${environment}:${cepDestino}:${Buffer.from(productsHash).toString('base64').substring(0, 32)}`
}

/**
 * Obtém entrada do cache se válida
 */
export function getCachedQuote(cacheKey: string): ShippingOption[] | null {
  const entry = cache.get(cacheKey)
  
  if (!entry) {
    return null
  }
  
  // Verificar se expirou
  if (Date.now() >= entry.expiresAt) {
    cache.delete(cacheKey)
    return null
  }
  
  return entry.options
}

/**
 * Armazena cotação no cache
 */
export function setCachedQuote(
  cacheKey: string,
  options: ShippingOption[],
  ttl: number = DEFAULT_TTL
): void {
  const now = Date.now()
  cache.set(cacheKey, {
    options,
    timestamp: now,
    expiresAt: now + ttl,
  })
}

/**
 * Remove entrada do cache
 */
export function invalidateCache(cacheKey: string): void {
  cache.delete(cacheKey)
}

/**
 * Limpa cache expirado
 */
export function cleanupExpiredCache(): void {
  const now = Date.now()
  const keysToDelete: string[] = []
  
  cache.forEach((entry, key) => {
    if (now >= entry.expiresAt) {
      keysToDelete.push(key)
    }
  })
  
  keysToDelete.forEach(key => cache.delete(key))
}

/**
 * Limpa todo o cache
 */
export function clearCache(): void {
  cache.clear()
}

/**
 * Obtém estatísticas do cache
 */
export function getCacheStats(): { size: number; entries: number } {
  return {
    size: cache.size,
    entries: cache.size,
  }
}
