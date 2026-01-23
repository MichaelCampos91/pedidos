-- ============================================
-- Seed - Dados Iniciais
-- ============================================
-- NOTA: Execute o seed_admin.sql separadamente para criar o admin
-- (precisa gerar o hash da senha com bcrypt)

-- Produtos de exemplo
INSERT INTO products (name, description, base_price, active) VALUES
    ('Decoração Completa', 'Pacote completo de decoração para festas', 500.00, true),
    ('Decoração Básica', 'Decoração básica com itens essenciais', 300.00, true),
    ('Decoração Premium', 'Decoração premium com itens exclusivos', 800.00, true),
    ('Banner Personalizado', 'Banner personalizado com tema escolhido', 150.00, true),
    ('Mesa Temática', 'Decoração completa de mesa temática', 250.00, true)
ON CONFLICT DO NOTHING;
