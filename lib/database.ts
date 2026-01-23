import { Pool } from 'pg'

// Configuração do pool usando variáveis de ambiente
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // SSL é necessário para conexões remotas (Cloud SQL, AWS RDS, etc.)
  // Se DB_SSL não estiver definido, tenta detectar automaticamente (se não for localhost)
  ssl: process.env.DB_SSL === 'true' || 
       (process.env.DB_SSL !== 'false' && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1')
    ? { rejectUnauthorized: false } 
    : false,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  max: 10,
})

// Log de eventos do pool
pool.on('connect', () => {
  console.log('✅ Conectado ao PostgreSQL')
})

pool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool do PostgreSQL:', err)
})

// Verificar se as variáveis de ambiente estão definidas
if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD) {
  console.error('❌ Variáveis de ambiente do banco de dados não estão definidas!')
  console.error('Certifique-se de que DB_HOST, DB_NAME, DB_USER e DB_PASSWORD estão no arquivo .env.local')
}

export async function query(text: string, params?: any[]) {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    if (process.env.NODE_ENV === 'development') {
      console.log('Executada query', { text, duration, rows: res.rowCount })
    }
    return res
  } catch (error: any) {
    console.error('Erro na query:', { text, error: error.message })
    throw error
  }
}

export function getDatabase() {
  return pool
}

// Função para testar conexão
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()')
    console.log('✅ Conexão com PostgreSQL testada com sucesso:', result.rows[0])
    return true
  } catch (error: any) {
    console.error('❌ Erro ao testar conexão:', error.message)
    return false
  }
}
