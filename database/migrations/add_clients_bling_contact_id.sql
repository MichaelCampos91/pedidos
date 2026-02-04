-- Migration: Adicionar coluna bling_contact_id na tabela clients
-- Armazena o ID do contato no Bling para evitar busca ao enviar pedidos

-- Adicionar coluna bling_contact_id (nullable, pois clientes antigos não terão)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS bling_contact_id BIGINT;

-- Criar índice único parcial para evitar duplicata de ID Bling entre clientes
-- (apenas onde bling_contact_id não é NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_bling_contact_id_unique 
ON clients(bling_contact_id) 
WHERE bling_contact_id IS NOT NULL;

-- Criar índice para busca rápida por bling_contact_id
CREATE INDEX IF NOT EXISTS idx_clients_bling_contact_id 
ON clients(bling_contact_id) 
WHERE bling_contact_id IS NOT NULL;
