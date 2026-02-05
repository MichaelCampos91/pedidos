-- ============================================
-- Seed: Pedidos e Itens de Pedido
-- ============================================
-- Inserir pedidos de exemplo com diferentes status e valores
-- Cada pedido inclui seus itens (order_items)

-- Pedido 1: Aguardando pagamento
WITH novo_pedido AS (
  INSERT INTO orders (client_id, status, total_items, total_shipping, total, shipping_address_id, created_at)
  SELECT 
    c.id,
    'aguardando_pagamento',
    3500.00,
    25.00,
    3525.00,
    ca.id,
    CURRENT_TIMESTAMP - INTERVAL '5 days'
  FROM clients c
  LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_default = true
  WHERE c.email = 'joao.silva@exemplo.com'
  LIMIT 1
  RETURNING id, client_id
)
INSERT INTO order_items (order_id, product_id, title, price, quantity)
SELECT 
  np.id,
  p.id,
  p.name,
  p.base_price,
  1
FROM novo_pedido np
CROSS JOIN products p
WHERE p.name = 'Notebook Dell Inspiron 15';

-- Pedido 2: Pago
WITH novo_pedido AS (
  INSERT INTO orders (client_id, status, total_items, total_shipping, total, shipping_address_id, paid_at, created_at)
  SELECT 
    c.id,
    'pago',
    1845.00,
    15.00,
    1860.00,
    ca.id,
    CURRENT_TIMESTAMP - INTERVAL '3 days',
    CURRENT_TIMESTAMP - INTERVAL '4 days'
  FROM clients c
  LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_default = true
  WHERE c.email = 'maria.santos@exemplo.com'
  LIMIT 1
  RETURNING id
)
INSERT INTO order_items (order_id, product_id, title, price, quantity)
SELECT np.id, p.id, p.name, p.base_price, 1
FROM novo_pedido np
CROSS JOIN products p
WHERE p.name IN ('Smartphone Samsung Galaxy A54', 'Camiseta Básica Algodão');

-- Pedido 3: Em preparação (com múltiplos itens)
WITH novo_pedido AS (
  INSERT INTO orders (client_id, status, total_items, total_shipping, total, shipping_address_id, paid_at, created_at)
  SELECT 
    c.id,
    'em_preparacao',
    290.00,
    20.00,
    310.00,
    ca.id,
    CURRENT_TIMESTAMP - INTERVAL '2 days',
    CURRENT_TIMESTAMP - INTERVAL '2 days'
  FROM clients c
  LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_default = true
  WHERE c.email = 'pedro.oliveira@exemplo.com'
  LIMIT 1
  RETURNING id
),
itens_pedido AS (
  SELECT np.id as order_id, p.id as product_id, p.name, p.base_price,
    CASE 
      WHEN p.name = 'Camiseta Básica Algodão' THEN 2
      ELSE 1
    END as quantity,
    CASE 
      WHEN p.name = 'Camiseta Básica Algodão' THEN 'Tamanho M'
      ELSE NULL
    END as observations
  FROM novo_pedido np
  CROSS JOIN products p
  WHERE p.name IN ('Camiseta Básica Algodão', 'Calça Jeans Masculina', 'Livro: O Poder do Hábito')
)
INSERT INTO order_items (order_id, product_id, title, price, quantity, observations)
SELECT order_id, product_id, name, base_price, quantity, observations
FROM itens_pedido;

-- Pedido 4: Enviado
WITH novo_pedido AS (
  INSERT INTO orders (client_id, status, total_items, total_shipping, total, shipping_address_id, shipping_tracking, paid_at, created_at)
  SELECT 
    c.id,
    'enviado',
    85.00,
    12.00,
    97.00,
    ca.id,
    'BR123456789BR',
    CURRENT_TIMESTAMP - INTERVAL '7 days',
    CURRENT_TIMESTAMP - INTERVAL '8 days'
  FROM clients c
  LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_default = true
  WHERE c.email = 'ana.costa@exemplo.com'
  LIMIT 1
  RETURNING id
)
INSERT INTO order_items (order_id, product_id, title, price, quantity)
SELECT np.id, p.id, p.name, p.base_price, 1
FROM novo_pedido np
CROSS JOIN products p
WHERE p.name = 'Luminária de Mesa LED';

-- Pedido 5: Entregue
WITH novo_pedido AS (
  INSERT INTO orders (client_id, status, total_items, total_shipping, total, shipping_address_id, paid_at, created_at)
  SELECT 
    c.id,
    'entregue',
    250.00,
    18.00,
    268.00,
    ca.id,
    CURRENT_TIMESTAMP - INTERVAL '10 days',
    CURRENT_TIMESTAMP - INTERVAL '12 days'
  FROM clients c
  LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_default = true
  WHERE c.cnpj = '12345678000190'
  LIMIT 1
  RETURNING id
)
INSERT INTO order_items (order_id, product_id, title, price, quantity)
SELECT np.id, p.id, p.name, p.base_price, 1
FROM novo_pedido np
CROSS JOIN products p
WHERE p.name = 'Jogo de Panelas Antiaderente';

-- Pedido 6: Cancelado
WITH novo_pedido AS (
  INSERT INTO orders (client_id, status, total_items, total_shipping, total, shipping_address_id, created_at)
  SELECT 
    c.id,
    'cancelado',
    120.00,
    15.00,
    135.00,
    ca.id,
    CURRENT_TIMESTAMP - INTERVAL '1 day'
  FROM clients c
  LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_default = true
  WHERE c.email = 'carlos.souza@exemplo.com'
  LIMIT 1
  RETURNING id
)
INSERT INTO order_items (order_id, product_id, title, price, quantity)
SELECT np.id, p.id, p.name, p.base_price, 1
FROM novo_pedido np
CROSS JOIN products p
WHERE p.name = 'Calça Jeans Masculina';
