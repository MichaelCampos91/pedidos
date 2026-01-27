-- Migração: Suportar múltiplas condições em regras de frete
-- Data: 2026-01-27
-- Descrição: Converte regras existentes para o novo formato que suporta múltiplas condições combinadas

DO $$
DECLARE
    rule_record RECORD;
    new_condition_value JSONB;
    current_condition_value JSONB;
BEGIN
    -- Iterar sobre todas as regras de frete
    FOR rule_record IN 
        SELECT id, condition_type, condition_value, shipping_methods
        FROM shipping_rules
    LOOP
        -- Inicializar novo condition_value
        new_condition_value := COALESCE(rule_record.condition_value, '{}'::JSONB);
        current_condition_value := COALESCE(rule_record.condition_value, '{}'::JSONB);
        
        -- Converter baseado no condition_type atual
        CASE rule_record.condition_type
            WHEN 'all' THEN
                -- Para "all", manter condition_value vazio ou como está
                -- Não precisa fazer nada
                NULL;
                
            WHEN 'min_value' THEN
                -- Se condition_value já tem min_value, manter
                -- Caso contrário, tentar extrair do formato antigo
                IF NOT (current_condition_value ? 'min_value') THEN
                    -- Se condition_value é um número simples, converter
                    IF jsonb_typeof(current_condition_value) = 'number' THEN
                        new_condition_value := jsonb_build_object('min_value', current_condition_value);
                    ELSIF jsonb_typeof(current_condition_value) = 'object' AND current_condition_value ? 'min_value' THEN
                        -- Já está no formato correto
                        new_condition_value := current_condition_value;
                    ELSE
                        -- Tentar manter o valor existente se houver
                        new_condition_value := current_condition_value;
                    END IF;
                END IF;
                
            WHEN 'states' THEN
                -- Garantir que states está no formato array
                IF NOT (current_condition_value ? 'states') THEN
                    -- Se condition_value é um array direto, converter
                    IF jsonb_typeof(current_condition_value) = 'array' THEN
                        new_condition_value := jsonb_build_object('states', current_condition_value);
                    ELSIF jsonb_typeof(current_condition_value) = 'object' AND current_condition_value ? 'states' THEN
                        -- Já está no formato correto
                        new_condition_value := current_condition_value;
                    ELSE
                        -- Criar objeto vazio com states
                        new_condition_value := jsonb_build_object('states', '[]'::JSONB);
                    END IF;
                END IF;
                
            WHEN 'shipping_methods' THEN
                -- shipping_methods já está em campo separado
                -- Mas podemos adicionar ao condition_value também para consistência
                IF rule_record.shipping_methods IS NOT NULL THEN
                    IF jsonb_typeof(rule_record.shipping_methods) = 'array' THEN
                        new_condition_value := new_condition_value || jsonb_build_object('shipping_methods', rule_record.shipping_methods);
                    END IF;
                END IF;
                
            ELSE
                -- Tipo desconhecido, manter como está
                new_condition_value := current_condition_value;
        END CASE;
        
        -- Atualizar a regra
        UPDATE shipping_rules
        SET condition_value = new_condition_value,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = rule_record.id;
        
        RAISE NOTICE 'Regra % migrada: condition_type=%, condition_value=%', 
            rule_record.id, rule_record.condition_type, new_condition_value;
    END LOOP;
    
    RAISE NOTICE 'Migração concluída com sucesso!';
END $$;

-- Comentário: A partir de agora, a função ruleApplies() verificará TODAS as condições
-- presentes em condition_value usando lógica AND, independente do condition_type.
