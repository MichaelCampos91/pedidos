-- Seed de configurações padrão do sistema
-- Execute este arquivo após criar as tabelas system_settings, payment_settings e installment_rates

-- Configuração de expiração de link de pagamento (em horas)
INSERT INTO system_settings (key, value, description)
VALUES ('payment_link_expiry_hours', '24', 'Tempo de expiração do link de pagamento em horas (padrão: 24 horas)')
ON CONFLICT (key) DO NOTHING;

-- Configuração padrão de prazo de produção (dias úteis a adicionar ao prazo do frete)
INSERT INTO system_settings (key, value, description)
VALUES ('production_days', '0', 'Dias úteis a adicionar ao prazo de entrega do frete')
ON CONFLICT (key) DO NOTHING;

-- Configuração padrão de desconto PIX (desabilitado por padrão)
INSERT INTO payment_settings (payment_method, setting_type, discount_type, discount_value, active)
VALUES ('pix', 'discount', 'percentage', 0, false)
ON CONFLICT DO NOTHING;

-- Taxas de parcelamento padrão (1x sem juros, demais com valores padrão)
-- Sandbox
INSERT INTO installment_rates (installments, rate_percentage, source, environment)
VALUES 
    (1, 0.00, 'manual', 'sandbox'),
    (2, 2.50, 'manual', 'sandbox'),
    (3, 3.50, 'manual', 'sandbox'),
    (4, 4.50, 'manual', 'sandbox'),
    (5, 5.50, 'manual', 'sandbox'),
    (6, 6.50, 'manual', 'sandbox'),
    (7, 7.50, 'manual', 'sandbox'),
    (8, 8.50, 'manual', 'sandbox'),
    (9, 9.50, 'manual', 'sandbox'),
    (10, 10.50, 'manual', 'sandbox'),
    (11, 11.50, 'manual', 'sandbox'),
    (12, 12.50, 'manual', 'sandbox')
ON CONFLICT (installments, environment) DO NOTHING;

-- Production
INSERT INTO installment_rates (installments, rate_percentage, source, environment)
VALUES 
    (1, 0.00, 'manual', 'production'),
    (2, 2.50, 'manual', 'production'),
    (3, 3.50, 'manual', 'production'),
    (4, 4.50, 'manual', 'production'),
    (5, 5.50, 'manual', 'production'),
    (6, 6.50, 'manual', 'production'),
    (7, 7.50, 'manual', 'production'),
    (8, 8.50, 'manual', 'production'),
    (9, 9.50, 'manual', 'production'),
    (10, 10.50, 'manual', 'production'),
    (11, 11.50, 'manual', 'production'),
    (12, 12.50, 'manual', 'production')
ON CONFLICT (installments, environment) DO NOTHING;
