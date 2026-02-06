#!/usr/bin/env node

/**
 * Script para testar envio de pedido ao Bling com logs detalhados
 * 
 * Uso: 
 *   node scripts/test-bling-order-sync.js <ORDER_ID> [--save]
 * 
 * Exibe todos os dados sendo enviados/retornados pela API do Bling sem sanitização.
 * Mostra cada etapa do processo: busca contato, criação contato, envio pedido.
 * 
 * Opções:
 *   --save ou --persist: Atualiza os campos no banco de dados após teste bem-sucedido
 *                        (bling_sync_status, bling_sync_error, bling_sale_numero, bling_contact_id)
 * 
 * Requer variáveis de ambiente do banco de dados (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)
 * que podem estar em .env.local ou definidas no ambiente.
 */

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const ORDER_ID = process.argv[2]
const SAVE_TO_DB = process.argv.includes('--save') || process.argv.includes('--persist')

if (!ORDER_ID || isNaN(parseInt(ORDER_ID))) {
  console.error('Erro: ID do pedido é obrigatório.')
  console.error('Uso: node scripts/test-bling-order-sync.js <ORDER_ID> [--save]')
  console.error('     Use --save para atualizar campos no banco após teste bem-sucedido')
  process.exit(1)
}

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

function logStep(step, message) {
  const timestamp = new Date().toISOString()
  console.log(`\n${'='.repeat(80)}`)
  console.log(`[${timestamp}] ${step}: ${message}`)
  console.log('='.repeat(80))
}

function logData(label, data) {
  console.log(`\n--- ${label} ---`)
  console.log(JSON.stringify(data, null, 2))
}

async function fetchOrder(orderId) {
  logStep('1', 'Buscando pedido no banco de dados')
  
  const orderResult = await query(
    `SELECT o.id, o.client_id, o.total, o.total_items, o.total_shipping, o.created_at, 
            o.shipping_address_id, o.observations, o.bling_sale_numero,
            c.name as client_name, c.cpf as client_cpf, c.cnpj as client_cnpj, 
            c.email as client_email, c.whatsapp as client_whatsapp, c.phone as client_phone, 
            c.bling_contact_id as client_bling_contact_id
     FROM orders o
     JOIN clients c ON o.client_id = c.id
     WHERE o.id = $1`,
    [orderId]
  )

  if (orderResult.rows.length === 0) {
    throw new Error(`Pedido ${orderId} não encontrado`)
  }

  const order = orderResult.rows[0]
  logData('Dados do Pedido', order)

  // Buscar endereço
  let address = null
  if (order.shipping_address_id) {
    const addrResult = await query(
      'SELECT street, number, complement, neighborhood, city, state, cep FROM client_addresses WHERE id = $1',
      [order.shipping_address_id]
    )
    if (addrResult.rows.length > 0) {
      address = addrResult.rows[0]
      logData('Endereço de Entrega', address)
    }
  }

  // Buscar itens
  const itemsResult = await query(
    'SELECT title, price, quantity, observations FROM order_items WHERE order_id = $1',
    [orderId]
  )
  const items = itemsResult.rows
  logData('Itens do Pedido', items)

  return {
    ...order,
    address,
    items
  }
}

async function getBlingToken() {
  logStep('2', 'Buscando token do Bling')
  
  const tokenResult = await query(
    `SELECT token_value FROM integration_tokens 
     WHERE provider='bling' AND environment='production' AND is_active=true 
     ORDER BY created_at DESC LIMIT 1`
  )

  if (tokenResult.rows.length === 0) {
    throw new Error('Token do Bling não encontrado no banco de dados.')
  }

  const token = tokenResult.rows[0].token_value.trim().replace(/^Bearer\s+/i, '')
  if (!token) {
    throw new Error('Token vazio ou inválido.')
  }

  console.log(`Token encontrado: ${token.substring(0, 20)}...`)
  return token
}

async function searchContact(cleanDoc, token) {
  logStep('3', `Buscando contato no Bling por documento: ${cleanDoc.substring(0, 3)}***`)
  
  const url = `${BLING_API_BASE}/contatos?numeroDocumento=${encodeURIComponent(cleanDoc)}`
  console.log(`\nGET ${url}`)
  
  const startTime = Date.now()
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  })
  const duration = Date.now() - startTime

  const responseText = await response.text()
  let responseData = null
  try {
    responseData = responseText ? JSON.parse(responseText) : null
  } catch {
    responseData = responseText
  }

  console.log(`\nStatus: ${response.status} ${response.statusText}`)
  console.log(`Tempo: ${duration}ms`)
  logData('Resposta da Busca', responseData)

  if (response.ok && responseData) {
    const contacts = Array.isArray(responseData) ? responseData : (responseData.data || [])
    for (const contact of contacts) {
      if (contact && typeof contact === 'object') {
        const doc = String(contact.numeroDocumento || contact.numero_documento || '').replace(/\D/g, '')
        if (doc === cleanDoc && contact.id != null) {
          console.log(`\n✅ Contato encontrado: ID ${contact.id}`)
          return Number(contact.id)
        }
      }
    }
  }

  return null
}

async function createContact(order, token) {
  logStep('4', 'Criando contato no Bling')
  
  const cleanDoc = (order.client_cpf || order.client_cnpj || '').replace(/\D/g, '')
  if (!cleanDoc) {
    throw new Error('CPF/CNPJ do cliente é obrigatório')
  }

  const tipo = cleanDoc.length === 11 ? 'F' : 'J'
  const contactPayload = {
    nome: order.client_name || 'Cliente',
    numeroDocumento: cleanDoc,
    tipo,
    situacao: 'A', // A = Ativo (obrigatório pela API do Bling)
  }

  if (order.client_email) contactPayload.email = order.client_email
  
  // Limpar telefones: remover formatação e deixar apenas dígitos
  // A API do Bling espera apenas DDD + número (sem código do país)
  // Formato esperado: DDD (2 dígitos) + número (8 ou 9 dígitos)
  if (order.client_whatsapp) {
    let cleanWhatsapp = String(order.client_whatsapp).replace(/\D/g, '')
    const originalWhatsapp = cleanWhatsapp
    console.log(`\n[DEBUG] WhatsApp original: ${order.client_whatsapp}`)
    console.log(`[DEBUG] WhatsApp apenas dígitos: ${cleanWhatsapp} (${cleanWhatsapp.length} dígitos)`)
    
    // Remover código do país (55) se estiver presente no início
    // Casos: 55 + DDD (2) + número (8-9) = 12-13 dígitos OU 55 + DDD (2) + número (8-9) = 11 dígitos (incompleto mas comum)
    if (cleanWhatsapp.startsWith('55')) {
      if (cleanWhatsapp.length >= 12) {
        // Número completo com código do país: remover 55
        cleanWhatsapp = cleanWhatsapp.substring(2)
        console.log(`[DEBUG] Removido código do país (55): ${cleanWhatsapp} (${cleanWhatsapp.length} dígitos)`)
      } else if (cleanWhatsapp.length === 11) {
        // Caso especial: 11 dígitos começando com 55 pode ser 55 + DDD (2) + número (8) incompleto
        // Tentar remover 55 e verificar se o DDD é válido
        const withoutCountry = cleanWhatsapp.substring(2)
        const ddd = withoutCountry.substring(0, 2)
        if (parseInt(ddd) >= 11 && parseInt(ddd) <= 99) {
          cleanWhatsapp = withoutCountry
          console.log(`[DEBUG] Removido código do país (55) de número 11 dígitos: ${cleanWhatsapp} (${cleanWhatsapp.length} dígitos)`)
        }
      }
    }
    
    // Remover 0 inicial após DDD se presente (formato antigo brasileiro)
    if (cleanWhatsapp.length === 11 && cleanWhatsapp[2] === '0') {
      cleanWhatsapp = cleanWhatsapp.substring(0, 2) + cleanWhatsapp.substring(3)
      console.log(`[DEBUG] Removido 0 após DDD: ${cleanWhatsapp} (${cleanWhatsapp.length} dígitos)`)
    }
    
    // Validar formato: DDD (2 dígitos) + número (8 ou 9 dígitos)
    // Celular deve ter 10 ou 11 dígitos no total após sanitização
    if (cleanWhatsapp.length === 10 || cleanWhatsapp.length === 11) {
      const ddd = cleanWhatsapp.substring(0, 2)
      const numero = cleanWhatsapp.substring(2)
      console.log(`[DEBUG] DDD: ${ddd}, Número: ${numero} (${numero.length} dígitos)`)
      
      // Validar DDD (11-99) e número (8 ou 9 dígitos para celular)
      if (parseInt(ddd) >= 11 && parseInt(ddd) <= 99 && numero.length >= 8 && numero.length <= 9) {
        contactPayload.celular = cleanWhatsapp
        console.log(`[DEBUG] ✅ Celular válido: ${cleanWhatsapp}`)
      } else {
        console.log(`[DEBUG] ⚠️  Celular inválido: DDD=${ddd} (${parseInt(ddd) >= 11 && parseInt(ddd) <= 99 ? 'válido' : 'inválido'}), Número=${numero.length} dígitos (esperado: 8-9)`)
      }
    } else {
      console.log(`[DEBUG] ⚠️  Celular com comprimento inválido: ${cleanWhatsapp.length} dígitos (esperado: 10-11)`)
    }
  }
  
  if (order.client_phone) {
    let cleanPhone = String(order.client_phone).replace(/\D/g, '')
    const originalPhone = cleanPhone
    console.log(`\n[DEBUG] Telefone original: ${order.client_phone}`)
    console.log(`[DEBUG] Telefone apenas dígitos: ${cleanPhone} (${cleanPhone.length} dígitos)`)
    
    // Remover código do país (55) se estiver presente no início
    // Casos: 55 + DDD (2) + número (8-9) = 12-13 dígitos OU 55 + DDD (2) + número (8-9) = 11 dígitos (incompleto mas comum)
    if (cleanPhone.startsWith('55')) {
      if (cleanPhone.length >= 12) {
        // Número completo com código do país: remover 55
        cleanPhone = cleanPhone.substring(2)
        console.log(`[DEBUG] Removido código do país (55): ${cleanPhone} (${cleanPhone.length} dígitos)`)
      } else if (cleanPhone.length === 11) {
        // Caso especial: 11 dígitos começando com 55 pode ser 55 + DDD (2) + número (8) incompleto
        // Tentar remover 55 e verificar se o DDD é válido
        const withoutCountry = cleanPhone.substring(2)
        const ddd = withoutCountry.substring(0, 2)
        if (parseInt(ddd) >= 11 && parseInt(ddd) <= 99) {
          cleanPhone = withoutCountry
          console.log(`[DEBUG] Removido código do país (55) de número 11 dígitos: ${cleanPhone} (${cleanPhone.length} dígitos)`)
        }
      }
    }
    
    // Remover 0 inicial após DDD se presente (formato antigo brasileiro)
    if (cleanPhone.length === 11 && cleanPhone[2] === '0') {
      cleanPhone = cleanPhone.substring(0, 2) + cleanPhone.substring(3)
      console.log(`[DEBUG] Removido 0 após DDD: ${cleanPhone} (${cleanPhone.length} dígitos)`)
    }
    
    // Validar formato: DDD (2 dígitos) + número (8 ou 9 dígitos)
    // Telefone fixo deve ter 10 dígitos (DDD + 8 dígitos) ou 11 dígitos (DDD + 9 dígitos)
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      const ddd = cleanPhone.substring(0, 2)
      const numero = cleanPhone.substring(2)
      console.log(`[DEBUG] DDD: ${ddd}, Número: ${numero} (${numero.length} dígitos)`)
      
      // Validar DDD (11-99) e número (8 ou 9 dígitos)
      if (parseInt(ddd) >= 11 && parseInt(ddd) <= 99 && numero.length >= 8 && numero.length <= 9) {
        contactPayload.telefone = cleanPhone
        console.log(`[DEBUG] ✅ Telefone válido: ${cleanPhone}`)
      } else {
        console.log(`[DEBUG] ⚠️  Telefone inválido: DDD=${ddd} (${parseInt(ddd) >= 11 && parseInt(ddd) <= 99 ? 'válido' : 'inválido'}), Número=${numero.length} dígitos (esperado: 8-9)`)
      }
    } else {
      console.log(`[DEBUG] ⚠️  Telefone com comprimento inválido: ${cleanPhone.length} dígitos (esperado: 10-11)`)
    }
  }

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
  console.log(`\nPOST ${url}`)
  logData('Payload de Criação', contactPayload)

  const startTime = Date.now()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(contactPayload),
  })
  const duration = Date.now() - startTime

  const responseText = await response.text()
  let responseData = null
  try {
    responseData = responseText ? JSON.parse(responseText) : null
  } catch {
    responseData = responseText
  }

  console.log(`\nStatus: ${response.status} ${response.statusText}`)
  console.log(`Tempo: ${duration}ms`)
  logData('Resposta da Criação', responseData)

  if (response.ok) {
    // Tentar extrair ID da resposta
    let contactId = null
    if (responseData) {
      if (responseData.id != null) contactId = responseData.id
      else if (responseData.data && responseData.data.id != null) contactId = responseData.data.id
      else if (responseData.data && responseData.data.data && responseData.data.data.id != null) {
        contactId = responseData.data.data.id
      }
    }

    if (contactId != null) {
      console.log(`\n✅ Contato criado: ID ${contactId}`)
      return Number(contactId)
    } else {
      console.log(`\n⚠️  ID não encontrado na resposta. Aguardando 500ms e buscando novamente...`)
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const foundId = await searchContact(cleanDoc, token)
      if (foundId != null) {
        console.log(`\n✅ Contato encontrado após criação: ID ${foundId}`)
        return foundId
      }
      
      throw new Error('Contato criado mas não foi possível obter o ID')
    }
  } else {
    throw new Error(`Erro ao criar contato: ${response.status} - ${JSON.stringify(responseData)}`)
  }
}

async function sendOrder(order, contactId, token) {
  logStep('5', 'Enviando pedido ao Bling')
  
  const numeroBling = order.bling_sale_numero || `PED-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`
  // Garantir que created_at seja uma string antes de usar slice
  const createdDate = order.created_at ? (typeof order.created_at === 'string' ? order.created_at : new Date(order.created_at).toISOString()) : new Date().toISOString()
  const dataEmissao = createdDate.slice(0, 10)
  
  // Armazenar numeroBling para possível atualização no banco
  order._numeroBling = numeroBling

  const payload = {
    numero: numeroBling,
    data: dataEmissao,
    contato: { id: contactId },
    itens: order.items.map((item, idx) => ({
      descricao: item.title || `Item ${idx + 1}`,
      quantidade: item.quantity || 1,
      valor: Number(item.price) || 0,
      observacao: item.observations || undefined,
    })),
    valorTotal: Number(order.total) || 0,
    valorProdutos: Number(order.total_items) || 0,
    valorFrete: Number(order.total_shipping) || 0,
  }

  if (order.observations) {
    payload.observacao = order.observations
  }

  const url = `${BLING_API_BASE}/pedidos/vendas`
  console.log(`\nPOST ${url}`)
  logData('Payload do Pedido', payload)

  const startTime = Date.now()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const duration = Date.now() - startTime

  const responseText = await response.text()
  let responseData = null
  try {
    responseData = responseText ? JSON.parse(responseText) : null
  } catch {
    responseData = responseText
  }

  console.log(`\nStatus: ${response.status} ${response.statusText}`)
  console.log(`Tempo: ${duration}ms`)
  logData('Resposta do Envio', responseData)

  if (response.ok) {
    let blingId = null
    if (responseData) {
      if (responseData.id != null) blingId = responseData.id
      else if (responseData.data && responseData.data.id != null) blingId = responseData.data.id
      else if (responseData.data && responseData.data.data && responseData.data.data.id != null) {
        blingId = responseData.data.data.id
      }
    }
    console.log(`\n✅ Pedido enviado com sucesso! ID Bling: ${blingId || 'N/A'}`)
    return { success: true, blingId }
  } else {
    throw new Error(`Erro ao enviar pedido: ${response.status} - ${JSON.stringify(responseData)}`)
  }
}

async function main() {
  try {
    const order = await fetchOrder(ORDER_ID)
    const token = await getBlingToken()

    const cleanDoc = (order.client_cpf || order.client_cnpj || '').replace(/\D/g, '')
    if (!cleanDoc) {
      throw new Error('Pedido sem CPF/CNPJ do cliente')
    }

    let contactId = order.client_bling_contact_id

    if (contactId) {
      logStep('3', `Usando bling_contact_id existente: ${contactId}`)
    } else {
      // Tentar buscar primeiro
      contactId = await searchContact(cleanDoc, token)
      
      if (!contactId) {
        // Criar se não encontrou
        contactId = await createContact(order, token)
      }
    }

    if (!contactId) {
      throw new Error('Não foi possível obter ID do contato no Bling')
    }

    // Enviar pedido
    const result = await sendOrder(order, contactId, token)

    // Se flag --save estiver ativa e envio foi bem-sucedido, atualizar banco de dados
    if (SAVE_TO_DB && result.success) {
      logStep('6', 'Atualizando campos no banco de dados')
      
      try {
        // Atualizar bling_contact_id no cliente (se foi criado/encontrado e diferente do atual)
        if (contactId && order.client_bling_contact_id !== contactId) {
          const clientUpdateResult = await query(
            'UPDATE clients SET bling_contact_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [contactId, order.client_id]
          )
          if (clientUpdateResult.rowCount && clientUpdateResult.rowCount > 0) {
            console.log(`✅ bling_contact_id atualizado no cliente: ${contactId}`)
          } else {
            console.log(`⚠️  bling_contact_id não atualizado (cliente não encontrado)`)
          }
        } else if (contactId && order.client_bling_contact_id === contactId) {
          console.log(`ℹ️  bling_contact_id já está correto no cliente: ${contactId}`)
        }
        
        // Atualizar campos do pedido
        const orderUpdateResult = await query(
          `UPDATE orders 
           SET bling_sync_status = 'synced', 
               bling_sync_error = NULL,
               bling_sale_numero = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [order._numeroBling, ORDER_ID]
        )
        if (orderUpdateResult.rowCount && orderUpdateResult.rowCount > 0) {
          console.log(`✅ Campos do pedido atualizados:`)
          console.log(`   - bling_sync_status: synced`)
          console.log(`   - bling_sync_error: NULL`)
          console.log(`   - bling_sale_numero: ${order._numeroBling}`)
        } else {
          console.log(`⚠️  Campos do pedido não atualizados (pedido não encontrado)`)
        }
      } catch (dbError) {
        console.error(`\n❌ Erro ao atualizar banco de dados:`)
        console.error(dbError.message)
        if (dbError.stack) {
          console.error(dbError.stack)
        }
        // Não falhar o script, apenas avisar
      }
    } else if (SAVE_TO_DB && !result.success) {
      console.log(`\n⚠️  Envio não foi bem-sucedido, campos não serão atualizados no banco`)
    } else if (!SAVE_TO_DB) {
      console.log(`\nℹ️  Use --save para atualizar campos no banco de dados após teste bem-sucedido`)
    }

    logStep('FINAL', 'Processo concluído com sucesso!')
    console.log(`\nResumo:`)
    console.log(`- Pedido ID: ${ORDER_ID}`)
    console.log(`- Contato Bling ID: ${contactId}`)
    console.log(`- Pedido Bling ID: ${result.blingId || 'N/A'}`)
    console.log(`- Número Bling: ${order._numeroBling}`)
    if (SAVE_TO_DB && result.success) {
      console.log(`- Campos atualizados no banco: Sim`)
    } else {
      console.log(`- Campos atualizados no banco: Não`)
    }

  } catch (error) {
    logStep('ERRO', 'Falha no processo')
    console.error('\nErro:', error.message)
    if (error.stack) {
      console.error('\nStack:', error.stack)
    }
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
