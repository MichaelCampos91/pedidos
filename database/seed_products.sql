-- ============================================
-- Seed: Produtos
-- ============================================
-- Inserir produtos de exemplo associados às categorias
-- Dimensões em cm, peso em kg

INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Notebook Dell Inspiron 15',
  'Notebook Dell Inspiron 15 3000, Intel Core i5, 8GB RAM, 256GB SSD',
  3500.00,
  35.0,
  2.5,
  25.0,
  2.0,
  true,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Eletrônicos'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Notebook Dell Inspiron 15'
  );

INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Smartphone Samsung Galaxy A54',
  'Smartphone Samsung Galaxy A54 5G, 128GB, 6GB RAM, Tela 6.4"',
  1800.00,
  15.8,
  0.8,
  7.6,
  0.2,
  true,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Eletrônicos'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Smartphone Samsung Galaxy A54'
  );

INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Camiseta Básica Algodão',
  'Camiseta básica 100% algodão, diversas cores disponíveis',
  45.00,
  30.0,
  2.0,
  25.0,
  0.15,
  true,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Roupas'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Camiseta Básica Algodão'
  );

INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Calça Jeans Masculina',
  'Calça jeans masculina, modelo slim, diversas numerações',
  120.00,
  35.0,
  3.0,
  30.0,
  0.5,
  true,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Roupas'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Calça Jeans Masculina'
  );

INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Luminária de Mesa LED',
  'Luminária de mesa LED com regulagem de intensidade e braço articulado',
  85.00,
  25.0,
  45.0,
  15.0,
  0.8,
  true,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Casa e Decoração'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Luminária de Mesa LED'
  );

INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Jogo de Panelas Antiaderente',
  'Jogo com 5 panelas antiaderente, cabo ergonômico',
  250.00,
  40.0,
  30.0,
  40.0,
  3.5,
  true,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Casa e Decoração'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Jogo de Panelas Antiaderente'
  );

INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Livro: O Poder do Hábito',
  'Livro "O Poder do Hábito" de Charles Duhigg, edição em português',
  45.00,
  16.0,
  23.0,
  2.5,
  0.4,
  true,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Livros'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Livro: O Poder do Hábito'
  );

INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Bola de Futebol Oficial',
  'Bola de futebol oficial, tamanho 5, couro sintético',
  80.00,
  22.0,
  22.0,
  22.0,
  0.4,
  true,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Esportes'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Bola de Futebol Oficial'
  );

INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Kit Shampoo e Condicionador',
  'Kit com shampoo e condicionador 400ml cada, hidratação profunda',
  35.00,
  8.0,
  20.0,
  8.0,
  0.8,
  true,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Beleza e Cuidados Pessoais'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Kit Shampoo e Condicionador'
  );

INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Quebra-Cabeça 1000 Peças',
  'Quebra-cabeça com 1000 peças, tema paisagem',
  55.00,
  50.0,
  70.0,
  5.0,
  0.6,
  true,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Brinquedos'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Quebra-Cabeça 1000 Peças'
  );

INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Café Gourmet 500g',
  'Café em grãos torrado, embalagem 500g, origem única',
  28.00,
  12.0,
  20.0,
  8.0,
  0.5,
  true,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Alimentos'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Café Gourmet 500g'
  );

-- Produto inativo para testes
INSERT INTO products (name, description, base_price, width, height, length, weight, active, category_id)
SELECT 
  'Produto Descontinuado',
  'Este produto não está mais disponível para venda',
  100.00,
  10.0,
  10.0,
  10.0,
  0.1,
  false,
  pc.id
FROM product_categories pc 
WHERE pc.name = 'Eletrônicos'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.name = 'Produto Descontinuado'
  );
