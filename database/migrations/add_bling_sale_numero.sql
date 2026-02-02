-- Número da venda enviado ao Bling (único por pedido, evita conflito com numeros já existentes no Bling)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bling_sale_numero VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_orders_bling_sale_numero ON orders(bling_sale_numero);
