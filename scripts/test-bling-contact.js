#!/usr/bin/env node

/**
 * Script para testar retorno bruto de um contato específico do Bling via API v3
 * 
 * Uso: 
 *   node scripts/test-bling-contact.js [CONTACT_ID]
 * 
 * Exibe o JSON bruto retornado pela API sem nenhum tratamento.
 * 
 * Requer variáveis de ambiente do banco de dados (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)
 * que podem estar em .env.local ou definidas no ambiente.
 */

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const CONTACT_ID = process.argv[2] || '17938232319'
const BLING_API_BASE = 'https://api.bling.com.br/Api/v3'

// Carregar variáveis de ambiente do .env.local se existir
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  })
}

// Criar pool de conexão
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' || 
       (process.env.DB_SSL !== 'false' && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1')
    ? { rejectUnauthorized: false } 
    : false,
})

async function query(text, params) {
  const res = await pool.query(text, params)
  return res
}

async function main() {
  try {
    // Buscar token do banco de dados
    console.log('Buscando token do Bling no banco de dados...')
    const tokenResult = await query(
      `SELECT token_value FROM integration_tokens 
       WHERE provider='bling' AND environment='production' AND is_active=true 
       ORDER BY created_at DESC LIMIT 1`
    )

    if (tokenResult.rows.length === 0) {
      console.error('Erro: Token do Bling não encontrado no banco de dados.')
      console.error('Certifique-se de que há um token ativo para bling/production.')
      process.exit(1)
    }

    const token = tokenResult.rows[0].token_value.trim().replace(/^Bearer\s+/i, '')
    
    if (!token) {
      console.error('Erro: Token vazio ou inválido.')
      process.exit(1)
    }

    console.log(`Token encontrado (${token.substring(0, 10)}...)`)
    console.log(`\nBuscando contato ID: ${CONTACT_ID}`)
    console.log(`URL: ${BLING_API_BASE}/contatos/${CONTACT_ID}\n`)

    // Fazer requisição à API do Bling
    const url = `${BLING_API_BASE}/contatos/${CONTACT_ID}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })

    console.log(`Status HTTP: ${response.status} ${response.statusText}`)
    console.log('\n=== RESPOSTA BRUTA DA API ===\n')

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Erro na requisição:')
      console.error(errorText)
      process.exit(1)
    }

    // Obter resposta como texto bruto primeiro
    const rawText = await response.text()
    console.log('Resposta como texto bruto:')
    console.log(rawText)
    console.log('\n=== RESPOSTA PARSEADA (JSON) ===\n')

    // Tentar parsear como JSON e exibir formatado
    try {
      const jsonData = JSON.parse(rawText)
      console.log(JSON.stringify(jsonData, null, 2))
    } catch (parseError) {
      console.error('Erro ao parsear JSON:', parseError.message)
      console.log('Exibindo resposta como texto acima.')
    }

  } catch (error) {
    console.error('\nErro ao executar script:')
    console.error(error)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  } finally {
    // Fechar conexão do banco
    await pool.end()
  }
}

main()
