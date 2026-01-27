-- Seed de configurações padrão do sistema
-- Execute este arquivo após criar a tabela system_settings

-- Configuração de expiração de link de pagamento (em horas)
INSERT INTO system_settings (key, value, description)
VALUES ('payment_link_expiry_hours', '24', 'Tempo de expiração do link de pagamento em horas (padrão: 24 horas)')
ON CONFLICT (key) DO NOTHING;
