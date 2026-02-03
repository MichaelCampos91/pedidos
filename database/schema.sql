-- ============================================
-- Gerenciador de Pedidos - Database Schema
-- PostgreSQL
-- ============================================

-- ============================================
-- Tabela: admins
-- ============================================
CREATE TABLE IF NOT EXISTS admins (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Tabela: clients
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
    id BIGSERIAL PRIMARY KEY,
    cpf VARCHAR(14) UNIQUE NOT NULL,
    cnpj VARCHAR(18),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    whatsapp VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Tabela: client_addresses
-- ============================================
CREATE TABLE IF NOT EXISTS client_addresses (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    cep VARCHAR(10) NOT NULL,
    street VARCHAR(255) NOT NULL,
    number VARCHAR(20),
    complement VARCHAR(255),
    neighborhood VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Tabela: products
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_price DECIMAL(10, 2) NOT NULL,
    width DECIMAL(10, 2),
    height DECIMAL(10, 2),
    length DECIMAL(10, 2),
    weight DECIMAL(10, 2),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Tabela: orders
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(id),
    status VARCHAR(50) NOT NULL DEFAULT 'aguardando_pagamento',
    total_items DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_shipping DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    shipping_method VARCHAR(100),
    shipping_option_id VARCHAR(255),
    shipping_company_name VARCHAR(255),
    shipping_delivery_time INTEGER,
    shipping_option_data JSONB,
    shipping_tracking VARCHAR(255),
    shipping_address_id BIGINT REFERENCES client_addresses(id),
    bling_sync_status VARCHAR(50) DEFAULT 'pending',
    bling_sync_error TEXT,
    paid_at TIMESTAMP,
    payment_link_token VARCHAR(255),
    payment_link_expires_at TIMESTAMP,
    payment_link_generated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Tabela: order_items
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES products(id),
    title VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    observations TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Tabela: payments
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    pagarme_transaction_id VARCHAR(255),
    method VARCHAR(50) NOT NULL,
    installments INTEGER DEFAULT 1,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Tabela: shipping_rules
-- ============================================
CREATE TABLE IF NOT EXISTS shipping_rules (
    id BIGSERIAL PRIMARY KEY,
    rule_type VARCHAR(50) NOT NULL, -- 'free_shipping', 'discount', 'surcharge', 'production_days'
    condition_type VARCHAR(50) NOT NULL, -- 'all', 'min_value', 'states', 'shipping_methods'
    condition_value JSONB, -- Valores específicos (valor mínimo, estados, métodos)
    discount_type VARCHAR(20), -- 'percentage', 'fixed'
    discount_value DECIMAL(10, 2) DEFAULT 0,
    shipping_methods JSONB, -- Array com IDs de métodos específicos (null = todos)
    production_days INTEGER DEFAULT 0, -- Dias úteis a adicionar ao prazo
    priority INTEGER DEFAULT 0, -- Ordem de aplicação (menor = maior prioridade)
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipping_rules_active ON shipping_rules(active);
CREATE INDEX IF NOT EXISTS idx_shipping_rules_rule_type ON shipping_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_shipping_rules_priority ON shipping_rules(priority);

-- ============================================
-- Tabela: bling_sync_logs
-- ============================================
CREATE TABLE IF NOT EXISTS bling_sync_logs (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    status VARCHAR(50) NOT NULL, -- 'success', 'error'
    error_message TEXT,
    response_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Tabela: order_history
-- ============================================
CREATE TABLE IF NOT EXISTS order_history (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    field_changed VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by BIGINT REFERENCES admins(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- Tabela: system_logs
-- ============================================
CREATE TABLE IF NOT EXISTS system_logs (
    id BIGSERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);

-- ============================================
-- Tabela: integration_tokens
-- ============================================
CREATE TABLE IF NOT EXISTS integration_tokens (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL, -- 'melhor_envio', 'pagarme', 'bling'
    environment VARCHAR(20) NOT NULL, -- 'sandbox', 'production'
    token_value TEXT NOT NULL,
    token_type VARCHAR(50) DEFAULT 'bearer', -- 'bearer', 'basic', 'api_key'
    additional_data JSONB, -- Para armazenar dados extras (client_id, secret, etc)
    is_active BOOLEAN DEFAULT true,
    last_validated_at TIMESTAMP,
    last_validation_status VARCHAR(20), -- 'valid', 'invalid', 'error'
    last_validation_error TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, environment)
);

CREATE INDEX IF NOT EXISTS idx_integration_tokens_provider ON integration_tokens(provider);
CREATE INDEX IF NOT EXISTS idx_integration_tokens_environment ON integration_tokens(environment);
CREATE INDEX IF NOT EXISTS idx_integration_tokens_is_active ON integration_tokens(is_active);

-- ============================================
-- Tabela: system_settings
-- ============================================
CREATE TABLE IF NOT EXISTS system_settings (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- ============================================
-- Tabela: payment_settings
-- ============================================
CREATE TABLE IF NOT EXISTS payment_settings (
    id BIGSERIAL PRIMARY KEY,
    payment_method VARCHAR(50) NOT NULL, -- 'pix', 'credit_card'
    setting_type VARCHAR(50) NOT NULL, -- 'discount', 'installment_interest'
    installments INTEGER, -- NULL para PIX, 1-12 para cartão
    discount_type VARCHAR(20), -- 'percentage', 'fixed'
    discount_value DECIMAL(10, 2),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_settings_payment_method ON payment_settings(payment_method);
CREATE INDEX IF NOT EXISTS idx_payment_settings_setting_type ON payment_settings(setting_type);
CREATE INDEX IF NOT EXISTS idx_payment_settings_active ON payment_settings(active);

-- ============================================
-- Tabela: installment_rates
-- ============================================
CREATE TABLE IF NOT EXISTS installment_rates (
    id BIGSERIAL PRIMARY KEY,
    installments INTEGER NOT NULL,
    rate_percentage DECIMAL(5, 2) NOT NULL,
    interest_free BOOLEAN NOT NULL DEFAULT false,
    source VARCHAR(20) DEFAULT 'manual', -- 'manual', 'pagarme'
    environment VARCHAR(20), -- 'sandbox', 'production'
    last_synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(installments, environment)
);

CREATE INDEX IF NOT EXISTS idx_installment_rates_installments ON installment_rates(installments);
CREATE INDEX IF NOT EXISTS idx_installment_rates_environment ON installment_rates(environment);

-- ============================================
-- Índices para performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_clients_cpf ON clients(cpf);
CREATE INDEX IF NOT EXISTS idx_client_addresses_client_id ON client_addresses(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_bling_sync_logs_order_id ON bling_sync_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON order_history(order_id);

-- ============================================
-- Triggers para atualizar updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_addresses_updated_at ON client_addresses;
CREATE TRIGGER update_client_addresses_updated_at
    BEFORE UPDATE ON client_addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shipping_rules_updated_at ON shipping_rules;
CREATE TRIGGER update_shipping_rules_updated_at
    BEFORE UPDATE ON shipping_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_integration_tokens_updated_at ON integration_tokens;
CREATE TRIGGER update_integration_tokens_updated_at
    BEFORE UPDATE ON integration_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_settings_updated_at ON payment_settings;
CREATE TRIGGER update_payment_settings_updated_at
    BEFORE UPDATE ON payment_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_installment_rates_updated_at ON installment_rates;
CREATE TRIGGER update_installment_rates_updated_at
    BEFORE UPDATE ON installment_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Verificação
-- ============================================
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;
