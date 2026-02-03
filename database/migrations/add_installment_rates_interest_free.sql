-- Migration: Adicionar coluna interest_free à tabela installment_rates
-- Permite marcar opções de parcelamento como "Sem Juros" no admin.

ALTER TABLE installment_rates
  ADD COLUMN IF NOT EXISTS interest_free BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN installment_rates.interest_free IS 'Se true, esta opção pode ser oferecida sem juros (respeitando parcela mínima quando definida)';
