-- ============================================
-- Seed: Categorias de Produtos
-- ============================================
-- Inserir categorias de exemplo para organização dos produtos

INSERT INTO product_categories (name, description)
SELECT name, description
FROM (VALUES
  ('Eletrônicos', 'Produtos eletrônicos e tecnológicos, incluindo notebooks, smartphones e acessórios'),
  ('Roupas', 'Vestuário e acessórios de moda para todas as idades'),
  ('Casa e Decoração', 'Itens para casa, decoração e organização'),
  ('Livros', 'Livros físicos e digitais de diversos gêneros'),
  ('Esportes', 'Equipamentos e acessórios esportivos'),
  ('Beleza e Cuidados Pessoais', 'Produtos de beleza, higiene e cuidados pessoais'),
  ('Brinquedos', 'Brinquedos e jogos para crianças'),
  ('Alimentos', 'Produtos alimentícios e bebidas')
) AS v(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM product_categories pc WHERE pc.name = v.name
);
