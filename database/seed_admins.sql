-- ============================================
-- Seed: Administradores
-- ============================================
-- Inserir dados de exemplo para desenvolvimento e testes
-- 
-- Senhas padrão para testes:
-- - admin@exemplo.com: admin123
-- - user@exemplo.com: senha123
-- 
-- Para gerar novos hashes, use:
-- const bcrypt = require('bcryptjs');
-- const hash = await bcrypt.hash('sua_senha', 10);

INSERT INTO admins (email, password_hash, name) VALUES
(
  'admin@exemplo.com',
  '$2a$10$5MwKBVJjBLI80kDfn2bm3OhrmrGUYzOWW4HpMkrUuCud08Pr.BlnS', -- admin123
  'Administrador Principal'
),
(
  'user@exemplo.com',
  '$2a$10$MNEc8EEU0pOJ0IkN26qSU.zB4VheCmFsyWtxMyXqg3NMpVgGOe5XG', -- senha123
  'Usuário Teste'
),
(
  'gerente@exemplo.com',
  '$2a$10$MNEc8EEU0pOJ0IkN26qSU.zB4VheCmFsyWtxMyXqg3NMpVgGOe5XG', -- senha123
  'Gerente de Vendas'
)
ON CONFLICT (email) DO NOTHING;
