-- Migration: Última data de sincronização por tipo (Bling)
-- entity_type: 'categories' | 'products' | 'contacts' | 'orders'

CREATE TABLE IF NOT EXISTS bling_sync_status (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL UNIQUE,
    last_synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bling_sync_status_entity_type ON bling_sync_status(entity_type);

DROP TRIGGER IF EXISTS update_bling_sync_status_updated_at ON bling_sync_status;
CREATE TRIGGER update_bling_sync_status_updated_at
    BEFORE UPDATE ON bling_sync_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
