-- Tabela: shipping_modalities
-- Armazena modalidades de frete do Melhor Envio; apenas as ativas aparecem na cotação e na criação de pedidos.
CREATE TABLE IF NOT EXISTS shipping_modalities (
    id BIGINT NOT NULL,
    environment VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    company_id BIGINT,
    company_name VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, environment)
);

CREATE INDEX IF NOT EXISTS idx_shipping_modalities_environment ON shipping_modalities(environment);
CREATE INDEX IF NOT EXISTS idx_shipping_modalities_active ON shipping_modalities(environment, active);
