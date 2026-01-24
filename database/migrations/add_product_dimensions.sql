-- Migration: Adicionar campos de dimensões e peso à tabela products
-- Data: 2026-01-23

-- Adicionar colunas de dimensões e peso se não existirem
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS width DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS height DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS length DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS weight DECIMAL(10,2);

-- Comentários para documentação
COMMENT ON COLUMN products.width IS 'Largura do produto em centímetros';
COMMENT ON COLUMN products.height IS 'Altura do produto em centímetros';
COMMENT ON COLUMN products.length IS 'Comprimento do produto em centímetros';
COMMENT ON COLUMN products.weight IS 'Peso do produto em quilogramas';
