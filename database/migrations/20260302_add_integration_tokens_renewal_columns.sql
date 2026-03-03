-- Migration: adicionar colunas de renovação para tokens de integrações
-- Objetivo: suportar renovação automática de token do Contrato Correios

ALTER TABLE public.integration_tokens
  ADD COLUMN IF NOT EXISTS last_renewed_at timestamp without time zone,
  ADD COLUMN IF NOT EXISTS last_renewal_error text;

