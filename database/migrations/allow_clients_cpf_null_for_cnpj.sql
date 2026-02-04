-- Migration: Permitir cpf nulo para clientes PJ (apenas CNPJ)
-- Necessário para importação de contatos Bling: documento com 14 dígitos vai em cnpj, cpf fica null.

ALTER TABLE clients ALTER COLUMN cpf DROP NOT NULL;

-- Índice único em cnpj para busca e evitar duplicata (apenas onde cnpj está preenchido)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_cnpj_unique
  ON clients(cnpj)
  WHERE cnpj IS NOT NULL;
