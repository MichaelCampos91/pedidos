-- Migration: Mover valor de CPF para CNPJ quando tiver mais de 11 dígitos
-- Percorre os clientes cujo campo cpf (apenas dígitos) tem mais de 11 caracteres,
-- grava esse valor em cnpj e deixa cpf null.

UPDATE clients
SET
  cnpj = REGEXP_REPLACE(cpf, '[^0-9]', '', 'g'),
  cpf = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE LENGTH(REGEXP_REPLACE(cpf, '[^0-9]', '', 'g')) > 11;
