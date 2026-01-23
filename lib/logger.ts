import { query } from './database'

export async function saveLog(level: string, message: string, metadata: any = null) {
  try {
    await query(
      `INSERT INTO system_logs (level, message, metadata)
       VALUES ($1, $2, $3)`,
      [level, message, metadata ? JSON.stringify(metadata) : null]
    )
    return { level, message, metadata, created_at: new Date().toISOString() }
  } catch (error: any) {
    // Se a tabela não existir, apenas loga no console sem quebrar a aplicação
    console.error('Erro ao salvar log:', error.message)
    // Retorna um log simulado para não quebrar o fluxo
    return { level, message, metadata, created_at: new Date().toISOString() }
  }
}
