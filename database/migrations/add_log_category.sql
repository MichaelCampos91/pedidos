-- Adicionar coluna category na tabela system_logs
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- Criar índice para category
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category);

-- Atualizar logs existentes com category baseado em message
UPDATE system_logs SET category = 'payment' WHERE (message LIKE '%pagamento%' OR message LIKE '%payment%' OR message LIKE '%Pagar.me%' OR message LIKE '%webhook%') AND category IS NULL;
UPDATE system_logs SET category = 'order' WHERE (message LIKE '%pedido%' OR message LIKE '%order%') AND category IS NULL;
UPDATE system_logs SET category = 'auth' WHERE (message LIKE '%login%' OR message LIKE '%autenticação%' OR message LIKE '%authentication%') AND category IS NULL;
UPDATE system_logs SET category = 'error' WHERE level = 'error' AND category IS NULL;
UPDATE system_logs SET category = 'integration' WHERE (message LIKE '%token%' OR message LIKE '%integração%' OR message LIKE '%integration%') AND category IS NULL;
UPDATE system_logs SET category = 'system' WHERE category IS NULL;
