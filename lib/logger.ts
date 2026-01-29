import { query } from './database'

/**
 * Infere categoria automaticamente baseado em level e message
 */
function inferCategory(level: string, message: string): string {
  const lowerMessage = message.toLowerCase()
  
  // Erros sempre são 'error'
  if (level === 'error') {
    return 'error'
  }
  
  // Categorias baseadas em palavras-chave na mensagem
  if (lowerMessage.includes('pagamento') || lowerMessage.includes('payment') || 
      lowerMessage.includes('pagar.me') || lowerMessage.includes('webhook') ||
      lowerMessage.includes('transaction') || lowerMessage.includes('transação')) {
    return 'payment'
  }
  
  if (lowerMessage.includes('pedido') || lowerMessage.includes('order')) {
    return 'order'
  }
  
  if (lowerMessage.includes('login') || lowerMessage.includes('autenticação') || 
      lowerMessage.includes('authentication') || lowerMessage.includes('logout')) {
    return 'auth'
  }
  
  if (lowerMessage.includes('token') || lowerMessage.includes('integração') || 
      lowerMessage.includes('integration') || lowerMessage.includes('melhor envio')) {
    return 'integration'
  }
  
  // Padrão para outros casos
  return 'system'
}

export async function saveLog(
  level: string, 
  message: string, 
  metadata: any = null,
  category?: string
) {
  try {
    // Inferir categoria se não fornecida
    const inferredCategory = category || inferCategory(level, message)
    
    await query(
      `INSERT INTO system_logs (level, message, metadata, category)
       VALUES ($1, $2, $3, $4)`,
      [level, message, metadata ? JSON.stringify(metadata) : null, inferredCategory]
    )
    return { level, message, metadata, category: inferredCategory, created_at: new Date().toISOString() }
  } catch (error: any) {
    // Se a tabela não existir, apenas loga no console sem quebrar a aplicação
    console.error('Erro ao salvar log:', error.message)
    // Retorna um log simulado para não quebrar o fluxo
    return { level, message, metadata, category: category || inferCategory(level, message), created_at: new Date().toISOString() }
  }
}
