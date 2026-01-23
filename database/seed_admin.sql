-- ============================================
-- Seed Admin - Gerenciador de Pedidos
-- ============================================
-- NOTA: Execute este script APÓS criar o hash da senha com bcrypt
-- 
-- Para gerar o hash, use Node.js:
-- const bcrypt = require('bcryptjs');
-- bcrypt.hash('admin123', 10).then(hash => console.log(hash));
--
-- Substitua $2a$10$SEU_HASH_AQUI pelo hash gerado
-- ============================================

-- Admin padrão (senha: admin123)
-- Substitua o password_hash pelo hash real gerado
INSERT INTO admins (email, password_hash, name)
VALUES ('admin@lojacenario.com.br', '$2a$12$6M78XlC1o1Q4OYqU39eT7OEa3.RfcpWbF7jWZ2JRvqhXZ5eLrd3AW', 'Administrador')
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name;
