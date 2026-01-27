import { query } from './database'

export interface SystemSetting {
  id: number
  key: string
  value: string
  description: string | null
  created_at: Date
  updated_at: Date
}

/**
 * Busca uma configuração do sistema pelo key
 */
export async function getSetting(key: string): Promise<string | null> {
  try {
    const result = await query(
      'SELECT value FROM system_settings WHERE key = $1',
      [key]
    )
    return result.rows.length > 0 ? result.rows[0].value : null
  } catch (error) {
    console.error(`Erro ao buscar configuração ${key}:`, error)
    return null
  }
}

/**
 * Busca uma configuração com valor padrão
 */
export async function getSettingWithDefault(key: string, defaultValue: string): Promise<string> {
  const value = await getSetting(key)
  return value || defaultValue
}

/**
 * Busca uma configuração como número
 */
export async function getSettingAsNumber(key: string, defaultValue: number): Promise<number> {
  const value = await getSetting(key)
  if (!value) return defaultValue
  const num = parseInt(value, 10)
  return isNaN(num) ? defaultValue : num
}

/**
 * Atualiza ou cria uma configuração
 */
export async function setSetting(key: string, value: string, description?: string): Promise<void> {
  try {
    await query(
      `INSERT INTO system_settings (key, value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) 
       DO UPDATE SET value = EXCLUDED.value, 
                     description = COALESCE(EXCLUDED.description, system_settings.description),
                     updated_at = CURRENT_TIMESTAMP`,
      [key, value, description || null]
    )
  } catch (error) {
    console.error(`Erro ao salvar configuração ${key}:`, error)
    throw error
  }
}

/**
 * Busca todas as configurações
 */
export async function getAllSettings(): Promise<SystemSetting[]> {
  try {
    const result = await query('SELECT * FROM system_settings ORDER BY key')
    return result.rows
  } catch (error) {
    console.error('Erro ao buscar configurações:', error)
    return []
  }
}

/**
 * Remove uma configuração
 */
export async function deleteSetting(key: string): Promise<void> {
  try {
    await query('DELETE FROM system_settings WHERE key = $1', [key])
  } catch (error) {
    console.error(`Erro ao deletar configuração ${key}:`, error)
    throw error
  }
}
