--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.0

-- Started on 2026-02-05 12:41:14 -03

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Entrada TOC 254 (classe 1255 OID 17728)
-- Nome: update_updated_at_column(); Tipo: FUNÇÃO; Schema: public; Proprietário: dbmasteruser
-- Função para atualizar automaticamente a coluna updated_at em triggers
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO dbmasteruser;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Entrada TOC 218 (classe 1259 OID 17558)
-- Nome: admins; Tipo: TABELA; Schema: public; Proprietário: dbmasteruser
-- 
-- Tabela: Administradores do sistema
-- 
-- Armazena os usuários administrativos que têm acesso ao painel de gestão.
-- Autenticação é feita via email e senha (hash bcrypt armazenado em password_hash).
-- 
-- Campos importantes:
--   - email: único, usado para login
--   - password_hash: hash bcrypt da senha (nunca armazenar senha em texto plano)
--   - name: nome completo do administrador (opcional)
-- 
-- Relacionamentos:
--   - Referenciada por: order_history.changed_by (histórico de alterações de pedidos)
--

CREATE TABLE public.admins (
    id bigint NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.admins OWNER TO dbmasteruser;

--
-- Entrada TOC 217 (classe 1259 OID 17557)
-- Nome: admins_id_seq; Tipo: SEQUÊNCIA; Schema: public; Proprietário: dbmasteruser
-- Sequência para geração automática de IDs da tabela admins
--

CREATE SEQUENCE public.admins_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admins_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4565 (class 0 OID 0)
-- Dependencies: 217
-- Name: admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.admins_id_seq OWNED BY public.admins.id;


--
-- Entrada TOC 253 (classe 1259 OID 18175)
-- Nome: bling_contact_import_jobs; Tipo: TABELA; Schema: public; Proprietário: dbmasteruser
-- 
-- Tabela: Jobs de importação de contatos do Bling (rastreamento de progresso)
-- 
-- Rastreia o progresso de importações em massa de contatos do Bling para o sistema.
-- Permite que o frontend exiba porcentagem de conclusão em tempo real durante importações longas.
-- 
-- Campos importantes:
--   - status: 'running' (em andamento), 'completed' (concluído), 'failed' (falhou)
--   - total_contacts: quantidade total de contatos a serem processados
--   - processed_contacts: quantidade já processada (usado para calcular porcentagem)
--   - imported_count: novos clientes criados
--   - updated_count: clientes existentes atualizados
--   - skipped_count: contatos ignorados (documento inválido, filtros não atendidos, etc.)
--   - error_message: mensagem de erro se status = 'failed'
-- 
-- Regras de negócio:
--   - Um job é criado no início de cada importação
--   - Progresso é atualizado periodicamente (a cada 5 contatos processados)
--   - Job é finalizado ao concluir ou em caso de erro não tratado
--   - Frontend consulta esta tabela via GET /api/bling/contacts/import/status
--

CREATE TABLE public.bling_contact_import_jobs (
    id bigint NOT NULL,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    finished_at timestamp without time zone,
    status character varying(20) DEFAULT 'running'::character varying NOT NULL,
    total_contacts integer DEFAULT 0 NOT NULL,
    processed_contacts integer DEFAULT 0 NOT NULL,
    imported_count integer DEFAULT 0 NOT NULL,
    updated_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_status CHECK (((status)::text = ANY ((ARRAY['running'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


ALTER TABLE public.bling_contact_import_jobs OWNER TO dbmasteruser;

--
-- TOC entry 252 (class 1259 OID 18174)
-- Name: bling_contact_import_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.bling_contact_import_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bling_contact_import_jobs_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4566 (class 0 OID 0)
-- Dependencies: 252
-- Name: bling_contact_import_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.bling_contact_import_jobs_id_seq OWNED BY public.bling_contact_import_jobs.id;


--
-- Entrada TOC 234 (classe 1259 OID 17685)
-- Nome: bling_sync_logs; Tipo: TABELA; Schema: public; Proprietário: dbmasteruser
-- 
-- Tabela: Logs de sincronização com o Bling
-- 
-- Registra tentativas de sincronização de pedidos com o Bling (sucesso ou falha).
-- Útil para auditoria e debug de problemas de integração.
-- 
-- Campos importantes:
--   - order_id: pedido que foi sincronizado (FK para orders)
--   - status: 'success' ou 'error'
--   - error_message: mensagem de erro se status = 'error'
--   - response_data: resposta completa da API Bling (JSON em texto)
-- 
-- Relacionamentos:
--   - Referencia: orders.id (FK)
-- 
-- Índices:
--   - idx_bling_sync_logs_order_id: para consultas rápidas por pedido
--

CREATE TABLE public.bling_sync_logs (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    status character varying(50) NOT NULL,
    error_message text,
    response_data text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.bling_sync_logs OWNER TO dbmasteruser;

--
-- TOC entry 233 (class 1259 OID 17684)
-- Name: bling_sync_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.bling_sync_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bling_sync_logs_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4567 (class 0 OID 0)
-- Dependencies: 233
-- Name: bling_sync_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.bling_sync_logs_id_seq OWNED BY public.bling_sync_logs.id;


--
-- Entrada TOC 249 (classe 1259 OID 17880)
-- Nome: bling_sync_status; Tipo: TABELA; Schema: public; Proprietário: dbmasteruser
-- 
-- Tabela: Status de sincronização por tipo de entidade (categorias, produtos, contatos, pedidos)
-- 
-- Armazena a última data de sincronização de cada tipo de entidade com o Bling.
-- Usado para exibir no frontend quando foi a última vez que cada tipo foi sincronizado.
-- 
-- Campos importantes:
--   - entity_type: tipo de entidade ('categories', 'products', 'contacts', 'orders')
--   - last_synced_at: timestamp da última sincronização bem-sucedida (NULL se nunca sincronizou)
-- 
-- Regras de negócio:
--   - entity_type é único (uma linha por tipo)
--   - Atualizado automaticamente após cada sincronização bem-sucedida
--   - Consultado pelo frontend para exibir "Última sincronização: DD/MM/YYYY HH:MM"
-- 
-- Índices:
--   - idx_bling_sync_status_entity_type: para consultas rápidas por tipo
--

CREATE TABLE public.bling_sync_status (
    id bigint NOT NULL,
    entity_type character varying(50) NOT NULL,
    last_synced_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.bling_sync_status OWNER TO dbmasteruser;

--
-- TOC entry 248 (class 1259 OID 17879)
-- Name: bling_sync_status_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.bling_sync_status_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bling_sync_status_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4568 (class 0 OID 0)
-- Dependencies: 248
-- Name: bling_sync_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.bling_sync_status_id_seq OWNED BY public.bling_sync_status.id;


--
-- Entrada TOC 222 (classe 1259 OID 17583)
-- Nome: client_addresses; Tipo: TABELA; Schema: public; Proprietário: dbmasteruser
-- 
-- Tabela: Endereços dos clientes (um cliente pode ter múltiplos endereços)
-- 
-- Armazena endereços de entrega dos clientes. Um cliente pode ter múltiplos endereços,
-- mas apenas um pode ser marcado como padrão (is_default = true).
-- 
-- Campos importantes:
--   - client_id: cliente proprietário do endereço (FK para clients)
--   - cep: CEP brasileiro (8 dígitos, obrigatório)
--   - street: nome da rua/avenida
--   - number: número do endereço (pode ser null)
--   - complement: complemento (apto, sala, etc.)
--   - neighborhood: bairro
--   - city: cidade
--   - state: estado (UF, 2 caracteres)
--   - is_default: se true, este é o endereço padrão do cliente
-- 
-- Relacionamentos:
--   - Referencia: clients.id (FK com CASCADE DELETE - endereços são deletados se cliente for deletado)
--   - Referenciada por: orders.shipping_address_id (endereço de entrega do pedido)
-- 
-- Regras de negócio:
--   - CEP deve ter 8 dígitos (validação no backend)
--   - Ao criar pedido, se não especificar endereço, usa o endereço padrão do cliente
--   - Endereços podem ser importados do Bling durante importação de contatos
-- 
-- Índices:
--   - idx_client_addresses_client_id: para consultas rápidas de endereços por cliente
--

CREATE TABLE public.client_addresses (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    cep character varying(10) NOT NULL,
    street character varying(255) NOT NULL,
    number character varying(20),
    complement character varying(255),
    neighborhood character varying(255),
    city character varying(100) NOT NULL,
    state character varying(2) NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.client_addresses OWNER TO dbmasteruser;

--
-- TOC entry 221 (class 1259 OID 17582)
-- Name: client_addresses_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.client_addresses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.client_addresses_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4569 (class 0 OID 0)
-- Dependencies: 221
-- Name: client_addresses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.client_addresses_id_seq OWNED BY public.client_addresses.id;


--
-- Entrada TOC 220 (classe 1259 OID 17570)
-- Nome: clients; Tipo: TABELA; Schema: public; Proprietário: dbmasteruser
-- 
-- Tabela: Clientes (pessoa física com CPF ou pessoa jurídica com CNPJ)
-- 
-- Armazena dados dos clientes do sistema. Suporta tanto pessoa física (CPF) quanto
-- pessoa jurídica (CNPJ). Clientes podem ser criados manualmente ou importados do Bling.
-- 
-- Campos importantes:
--   - cpf: CPF da pessoa física (11 dígitos, único se não null)
--   - cnpj: CNPJ da pessoa jurídica (14 dígitos, único se não null)
--   - name: nome completo (obrigatório)
--   - email: email do cliente (opcional, usado para envio de links de pagamento)
--   - phone: telefone fixo (opcional)
--   - whatsapp: WhatsApp do cliente (obrigatório, usado para comunicação)
--   - bling_contact_id: ID do contato no Bling (se importado/integrado)
-- 
-- Relacionamentos:
--   - Referenciada por: orders.client_id (pedidos do cliente)
--   - Referenciada por: client_addresses.client_id (endereços do cliente)
-- 
-- Regras de negócio:
--   - Cliente deve ter CPF OU CNPJ (não ambos, não nenhum)
--   - CPF é único (constraint UNIQUE)
--   - CNPJ é único quando não null (índice único parcial)
--   - bling_contact_id é único quando não null (índice único parcial)
--   - WhatsApp é obrigatório (campo NOT NULL)
--   - Clientes podem ser importados do Bling via importação em massa
--   - Durante importação, sistema busca por CPF/CNPJ ou bling_contact_id para evitar duplicatas
-- 
-- Índices:
--   - idx_clients_cpf: para buscas rápidas por CPF
--   - idx_clients_bling_contact_id: para buscas por ID do Bling
--   - idx_clients_bling_contact_id_unique: garante unicidade do bling_contact_id
--   - idx_clients_cnpj_unique: garante unicidade do CNPJ
--

CREATE TABLE public.clients (
    id bigint NOT NULL,
    cpf character varying(14),
    cnpj character varying(18),
    name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(20),
    whatsapp character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    bling_contact_id bigint
);


ALTER TABLE public.clients OWNER TO dbmasteruser;

--
-- TOC entry 219 (class 1259 OID 17569)
-- Name: clients_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.clients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clients_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4570 (class 0 OID 0)
-- Dependencies: 219
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.clients_id_seq OWNED BY public.clients.id;


--
-- TOC entry 246 (class 1259 OID 17817)
-- Name: installment_rates; Type: TABLE; Schema: public; Owner: dbmasteruser
-- 
-- Tabela: Taxas de parcelamento para pagamentos
-- 
-- Armazena as taxas de juros aplicadas em diferentes quantidades de parcelas.
-- Taxas podem ser configuradas manualmente ou importadas do Pagar.me.
-- 
-- Campos importantes:
--   - installments: quantidade de parcelas (1 a 12)
--   - rate_percentage: taxa de juros em porcentagem (ex: 2.50 = 2,5%)
--   - source: origem da taxa ('manual' ou 'pagarme')
--   - environment: ambiente ('sandbox' ou 'production')
--   - interest_free: se true, esta opção pode ser oferecida sem juros
--   - last_synced_at: última vez que foi sincronizado do Pagar.me (se source = 'pagarme')
-- 
-- Regras de negócio:
--   - Taxas são específicas por ambiente (sandbox/production)
--   - Taxas podem ser importadas do Pagar.me via API
--   - Se interest_free = true, sistema pode oferecer sem juros respeitando parcela mínima
--   - Taxa de 1x (à vista) geralmente tem rate_percentage = 0
--   - Usado no cálculo de valores de parcelas durante checkout
-- 
-- Índices:
--   - idx_installment_rates_installments: para consultas rápidas por quantidade de parcelas
--

CREATE TABLE public.installment_rates (
    id bigint NOT NULL,
    installments integer NOT NULL,
    rate_percentage numeric(5,2) NOT NULL,
    source character varying(20) DEFAULT 'manual'::character varying,
    environment character varying(20),
    last_synced_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    interest_free boolean DEFAULT false NOT NULL
);


ALTER TABLE public.installment_rates OWNER TO dbmasteruser;

--
-- TOC entry 4571 (class 0 OID 0)
-- Dependencies: 246
-- Name: COLUMN installment_rates.interest_free; Type: COMMENT; Schema: public; Owner: dbmasteruser
--

COMMENT ON COLUMN public.installment_rates.interest_free IS 'Se true, esta opção pode ser oferecida sem juros (respeitando parcela mínima quando definida)';


--
-- TOC entry 245 (class 1259 OID 17816)
-- Name: installment_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.installment_rates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.installment_rates_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4572 (class 0 OID 0)
-- Dependencies: 245
-- Name: installment_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.installment_rates_id_seq OWNED BY public.installment_rates.id;


--
-- TOC entry 240 (class 1259 OID 17748)
-- Name: integration_tokens; Type: TABLE; Schema: public; Owner: dbmasteruser
-- 
-- Tabela: Tokens de autenticação para integrações externas
-- 
-- Armazena tokens OAuth e API keys para integrações com Bling, Melhor Envio e Pagar.me.
-- Tokens são validados periodicamente e podem expirar.
-- 
-- Campos importantes:
--   - provider: provedor da integração ('bling', 'melhor_envio', 'pagarme')
--   - environment: ambiente ('sandbox' ou 'production')
--   - token_value: valor do token (criptografado ou armazenado com segurança)
--   - token_type: tipo do token ('bearer', 'oauth2', 'api_key')
--   - additional_data: dados adicionais em JSON (refresh_token, scope, etc.)
--   - is_active: se false, token não deve ser usado
--   - last_validated_at: última vez que o token foi validado
--   - last_validation_status: resultado da validação ('valid', 'invalid', 'expired')
--   - last_validation_error: mensagem de erro se validação falhou
--   - expires_at: data de expiração do token (NULL se não expira)
-- 
-- Regras de negócio:
--   - Um token por provider + environment (único)
--   - Tokens são validados antes de uso em APIs externas
--   - Se token expirar, sistema tenta renovar usando refresh_token (se disponível)
--   - Tokens inativos não são usados em requisições
--   - Validação automática ocorre periodicamente via cron job
-- 
-- Índices:
--   - idx_integration_tokens_provider_env: para consultas rápidas por provider e ambiente
--   - idx_integration_tokens_provider_env_unique: garante unicidade por provider + environment
--

CREATE TABLE public.integration_tokens (
    id bigint NOT NULL,
    provider character varying(50) NOT NULL,
    environment character varying(20) NOT NULL,
    token_value text NOT NULL,
    token_type character varying(50) DEFAULT 'bearer'::character varying,
    additional_data jsonb,
    is_active boolean DEFAULT true,
    last_validated_at timestamp without time zone,
    last_validation_status character varying(20),
    last_validation_error text,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.integration_tokens OWNER TO dbmasteruser;

--
-- TOC entry 239 (class 1259 OID 17747)
-- Name: integration_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.integration_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.integration_tokens_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4573 (class 0 OID 0)
-- Dependencies: 239
-- Name: integration_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.integration_tokens_id_seq OWNED BY public.integration_tokens.id;


--
-- TOC entry 236 (class 1259 OID 17700)
-- Name: order_history; Type: TABLE; Schema: public; Owner: dbmasteruser
-- 
-- Tabela: Histórico de alterações de pedidos
-- 
-- Registra todas as alterações feitas em pedidos, incluindo mudanças de status,
-- valores, endereços, etc. Útil para auditoria e rastreamento de mudanças.
-- 
-- Campos importantes:
--   - order_id: pedido que foi alterado (FK obrigatória para orders)
--   - field_changed: nome do campo que foi alterado (ex: 'status', 'total', 'shipping_address_id')
--   - old_value: valor anterior (em texto)
--   - new_value: novo valor (em texto)
--   - changed_by: admin que fez a alteração (FK opcional para admins)
-- 
-- Relacionamentos:
--   - Referencia: orders.id (FK obrigatória)
--   - Referencia: admins.id (FK opcional)
-- 
-- Regras de negócio:
--   - Uma linha é criada para cada campo alterado em uma atualização
--   - Valores são armazenados como texto (conversão feita no backend)
--   - Se changed_by for NULL, alteração foi feita pelo sistema (ex: webhook Pagar.me)
--   - Histórico não deve ser deletado (auditoria)
-- 
-- Índices:
--   - idx_order_history_order_id: para consultas rápidas de histórico por pedido
--

CREATE TABLE public.order_history (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    field_changed character varying(100) NOT NULL,
    old_value text,
    new_value text,
    changed_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.order_history OWNER TO dbmasteruser;

--
-- TOC entry 235 (class 1259 OID 17699)
-- Name: order_history_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.order_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_history_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4574 (class 0 OID 0)
-- Dependencies: 235
-- Name: order_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.order_history_id_seq OWNED BY public.order_history.id;


--
-- Entrada TOC 228 (classe 1259 OID 17638)
-- Nome: order_items; Tipo: TABELA; Schema: public; Proprietário: dbmasteruser
-- 
-- Tabela: Itens dos pedidos (produtos e quantidades de cada pedido)
-- 
-- Armazena os produtos incluídos em cada pedido. Cada linha representa um item
-- do pedido com sua quantidade e preço no momento da compra.
-- 
-- Campos importantes:
--   - order_id: pedido ao qual este item pertence (FK obrigatória para orders)
--   - product_id: produto relacionado (FK opcional para products, pode ser NULL se produto foi deletado)
--   - title: nome do produto no momento da compra (snapshot, não muda mesmo se produto for alterado)
--   - price: preço unitário do produto no momento da compra (snapshot)
--   - quantity: quantidade deste item no pedido (mínimo 1)
--   - observations: observações específicas deste item (ex: "sem cebola", "tamanho grande")
-- 
-- Relacionamentos:
--   - Referencia: orders.id (FK obrigatória com CASCADE DELETE)
--   - Referencia: products.id (FK opcional, pode ser NULL se produto foi deletado)
-- 
-- Regras de negócio:
--   - Preço e título são snapshots (não mudam mesmo se produto for alterado depois)
--   - Se produto for deletado, product_id fica NULL mas dados do item permanecem
--   - Quantidade mínima é 1
--   - Soma de (price * quantity) de todos os itens = orders.total_items
--   - Itens são criados quando pedido é criado e não devem ser modificados após criação
-- 
-- Índices:
--   - idx_order_items_order_id: para consultas rápidas de itens por pedido
--

CREATE TABLE public.order_items (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    product_id bigint,
    title character varying(255) NOT NULL,
    price numeric(10,2) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    observations text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.order_items OWNER TO dbmasteruser;

--
-- TOC entry 227 (class 1259 OID 17637)
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4575 (class 0 OID 0)
-- Dependencies: 227
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Entrada TOC 226 (classe 1259 OID 17612)
-- Nome: orders; Tipo: TABELA; Schema: public; Proprietário: dbmasteruser
-- 
-- Tabela: Pedidos de venda (com status, valores, endereço de entrega e integração Bling)
-- 
-- Tabela central do sistema. Armazena todos os pedidos de venda com seus valores,
-- status, informações de frete e integração com Bling e Pagar.me.
-- 
-- Campos importantes:
--   - client_id: cliente que fez o pedido (FK obrigatória para clients)
--   - status: status do pedido ('aguardando_pagamento', 'pago', 'em_preparacao', 'enviado', 'entregue', 'cancelado')
--   - total_items: soma dos valores dos itens (sem frete)
--   - total_shipping: valor do frete
--   - total: valor total do pedido (total_items + total_shipping)
--   - shipping_address_id: endereço de entrega (FK para client_addresses)
--   - shipping_method: método de envio selecionado
--   - shipping_tracking: código de rastreamento (preenchido quando status = 'enviado')
--   - shipping_option_id: ID da opção de frete selecionada (Melhor Envio)
--   - shipping_company_name: nome da transportadora
--   - shipping_delivery_time: prazo de entrega em dias úteis
--   - shipping_option_data: dados completos da opção de frete (JSON)
--   - bling_sync_status: status de sincronização com Bling ('pending', 'synced', 'error')
--   - bling_sync_error: mensagem de erro se sincronização falhou
--   - bling_sale_numero: número da venda no Bling (após sincronização bem-sucedida)
--   - paid_at: timestamp de quando o pedido foi pago
--   - payment_link_token: token do link de pagamento gerado (Pagar.me)
--   - payment_link_expires_at: data de expiração do link de pagamento
--   - payment_link_generated_at: quando o link foi gerado
--   - observations: observações do pedido (notas internas)
--   - tags: tags para organização/filtros (texto separado por vírgulas)
-- 
-- Relacionamentos:
--   - Referencia: clients.id (FK obrigatória)
--   - Referencia: client_addresses.id (FK opcional para endereço de entrega)
--   - Referenciada por: order_items.order_id (itens do pedido)
--   - Referenciada por: payments.order_id (pagamentos do pedido)
--   - Referenciada por: bling_sync_logs.order_id (logs de sincronização)
--   - Referenciada por: order_history.order_id (histórico de alterações)
-- 
-- Regras de negócio:
--   - Status inicial sempre é 'aguardando_pagamento'
--   - Pedido só pode ser sincronizado com Bling após ser pago (paid_at não null)
--   - bling_sale_numero é único e reutilizado em reenvios para o mesmo pedido
--   - Links de pagamento expiram após payment_link_expires_at
--   - Total deve ser sempre total_items + total_shipping
--   - Pedidos podem ser criados manualmente pelo admin ou via checkout público
-- 
-- Índices:
--   - idx_orders_client_id: para listar pedidos de um cliente
--   - idx_orders_status: para filtros por status
--   - idx_orders_created_at: para ordenação e filtros por data
--   - idx_orders_bling_sale_numero: para buscas por número da venda no Bling
--

CREATE TABLE public.orders (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    status character varying(50) DEFAULT 'aguardando_pagamento'::character varying NOT NULL,
    total_items numeric(10,2) DEFAULT 0 NOT NULL,
    total_shipping numeric(10,2) DEFAULT 0,
    total numeric(10,2) DEFAULT 0 NOT NULL,
    shipping_method character varying(100),
    shipping_tracking character varying(255),
    shipping_address_id bigint,
    bling_sync_status character varying(50) DEFAULT 'pending'::character varying,
    bling_sync_error text,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    payment_link_token character varying(255),
    payment_link_expires_at timestamp without time zone,
    payment_link_generated_at timestamp without time zone,
    shipping_option_id character varying(255),
    shipping_company_name character varying(255),
    shipping_delivery_time integer,
    shipping_option_data jsonb,
    observations text,
    tags text,
    bling_sale_numero character varying(80)
);


ALTER TABLE public.orders OWNER TO dbmasteruser;

--
-- TOC entry 225 (class 1259 OID 17611)
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4576 (class 0 OID 0)
-- Dependencies: 225
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- TOC entry 244 (class 1259 OID 17807)
-- Name: payment_settings; Type: TABLE; Schema: public; Owner: dbmasteruser
-- 
-- Tabela: Configurações de métodos de pagamento
-- 
-- Armazena configurações personalizadas para métodos de pagamento, incluindo
-- descontos e limites de parcelamento. Usado para aplicar regras de negócio
-- específicas por método de pagamento.
-- 
-- Campos importantes:
--   - payment_method: método de pagamento ('credit_card', 'debit_card', 'pix', 'boleto')
--   - setting_type: tipo de configuração ('discount', 'installment_limit', 'min_value')
--   - installments: quantidade máxima de parcelas permitida (se setting_type = 'installment_limit')
--   - discount_type: tipo de desconto ('percentage' ou 'fixed')
--   - discount_value: valor do desconto (porcentagem ou valor fixo)
--   - active: se false, configuração não é aplicada
-- 
-- Regras de negócio:
--   - Múltiplas configurações podem existir para o mesmo payment_method
--   - Configurações inativas (active = false) são ignoradas
--   - Descontos são aplicados durante o checkout
--   - Limites de parcelamento são validados antes de gerar link de pagamento
--   - Usado em conjunto com installment_rates para calcular valores finais
-- 
-- Índices:
--   - idx_payment_settings_method: para consultas rápidas por método de pagamento
--

CREATE TABLE public.payment_settings (
    id bigint NOT NULL,
    payment_method character varying(50) NOT NULL,
    setting_type character varying(50) NOT NULL,
    installments integer,
    discount_type character varying(20),
    discount_value numeric(10,2),
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payment_settings OWNER TO dbmasteruser;

--
-- TOC entry 243 (class 1259 OID 17806)
-- Name: payment_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.payment_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_settings_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4577 (class 0 OID 0)
-- Dependencies: 243
-- Name: payment_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.payment_settings_id_seq OWNED BY public.payment_settings.id;


--
-- TOC entry 230 (class 1259 OID 17659)
-- Name: payments; Type: TABLE; Schema: public; Owner: dbmasteruser
-- 
-- Tabela: Pagamentos dos pedidos
-- 
-- Registra todos os pagamentos realizados para pedidos. Um pedido pode ter múltiplos
-- pagamentos (ex: pagamento parcial, estorno e novo pagamento). Integrado com Pagar.me.
-- 
-- Campos importantes:
--   - order_id: pedido ao qual este pagamento pertence (FK obrigatória para orders)
--   - pagarme_transaction_id: ID da transação no Pagar.me (único quando não null)
--   - method: método de pagamento ('credit_card', 'debit_card', 'pix', 'boleto')
--   - installments: quantidade de parcelas (1 = à vista)
--   - amount: valor pago neste pagamento
--   - status: status do pagamento ('pending', 'paid', 'refunded', 'failed', 'cancelled')
--   - paid_at: timestamp de quando o pagamento foi confirmado (NULL se ainda pendente)
-- 
-- Relacionamentos:
--   - Referencia: orders.id (FK obrigatória)
-- 
-- Regras de negócio:
--   - Um pedido pode ter múltiplos pagamentos (pagamentos parciais)
--   - Soma de todos os pagamentos com status 'paid' não deve exceder orders.total
--   - Quando status muda para 'paid', orders.paid_at é atualizado (se primeiro pagamento)
--   - pagarme_transaction_id é único (índice único parcial)
--   - Status é atualizado via webhook do Pagar.me
--   - Se pagamento falhar, novo pagamento pode ser criado para o mesmo pedido
-- 
-- Índices:
--   - idx_payments_order_id: para consultas rápidas de pagamentos por pedido
--   - idx_payments_pagarme_transaction_id: para buscas por ID da transação Pagar.me
--   - idx_payments_pagarme_transaction_id_unique: garante unicidade do pagarme_transaction_id
--

CREATE TABLE public.payments (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    pagarme_transaction_id character varying(255),
    method character varying(50) NOT NULL,
    installments integer DEFAULT 1,
    amount numeric(10,2) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payments OWNER TO dbmasteruser;

--
-- TOC entry 229 (class 1259 OID 17658)
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4578 (class 0 OID 0)
-- Dependencies: 229
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Entrada TOC 251 (classe 1259 OID 17893)
-- Nome: product_categories; Tipo: TABELA; Schema: public; Proprietário: dbmasteruser
-- 
-- Tabela: Categorias de produtos para organização do catálogo
-- 
-- Organiza produtos em categorias para facilitar navegação e gestão do catálogo.
-- Categorias podem ser criadas manualmente ou importadas do Bling.
-- 
-- Campos importantes:
--   - name: nome da categoria (obrigatório, único)
--   - description: descrição da categoria (opcional)
-- 
-- Relacionamentos:
--   - Referenciada por: products.category_id (produtos desta categoria)
-- 
-- Regras de negócio:
--   - Nome é único (constraint UNIQUE)
--   - Categorias podem ser importadas do Bling via sincronização
--   - Se categoria for deletada, produtos com category_id ficam sem categoria (NULL)
--   - Usado para filtros e organização no catálogo
-- 
-- Índices:
--   - idx_product_categories_name_unique: garante unicidade do nome
--

CREATE TABLE public.product_categories (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.product_categories OWNER TO dbmasteruser;

--
-- TOC entry 250 (class 1259 OID 17892)
-- Name: product_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.product_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.product_categories_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4579 (class 0 OID 0)
-- Dependencies: 250
-- Name: product_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.product_categories_id_seq OWNED BY public.product_categories.id;


--
-- Entrada TOC 224 (classe 1259 OID 17600)
-- Nome: products; Tipo: TABELA; Schema: public; Proprietário: dbmasteruser
-- 
-- Tabela: Produtos do catálogo (com preços, dimensões, peso e categoria)
-- 
-- Armazena todos os produtos disponíveis para venda. Produtos podem ser criados
-- manualmente ou importados do Bling. Dimensões e peso são usados para cálculo de frete.
-- 
-- Campos importantes:
--   - name: nome do produto (obrigatório)
--   - description: descrição detalhada do produto
--   - base_price: preço base do produto (obrigatório)
--   - active: se false, produto não aparece no catálogo público
--   - width: largura em cm (usado para cálculo de frete)
--   - height: altura em cm (usado para cálculo de frete)
--   - length: comprimento em cm (usado para cálculo de frete)
--   - weight: peso em kg (usado para cálculo de frete)
--   - category_id: categoria do produto (FK opcional para product_categories)
-- 
-- Relacionamentos:
--   - Referencia: product_categories.id (FK opcional)
--   - Referenciada por: order_items.product_id (itens de pedidos)
-- 
-- Regras de negócio:
--   - Produtos inativos (active = false) não aparecem no checkout público
--   - Dimensões e peso são obrigatórios para cálculo de frete via Melhor Envio
--   - Preço pode ser alterado sem afetar pedidos já criados (order_items guarda snapshot)
--   - Produtos podem ser importados do Bling via sincronização
--   - Se produto for deletado, order_items.product_id fica NULL mas dados permanecem
-- 
-- Índices:
--   - idx_products_category_id: para filtros por categoria
--   - idx_products_active: para consultas rápidas de produtos ativos
--

CREATE TABLE public.products (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    base_price numeric(10,2) NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    width numeric(10,2),
    height numeric(10,2),
    length numeric(10,2),
    weight numeric(10,2),
    category_id bigint
);


ALTER TABLE public.products OWNER TO dbmasteruser;

--
-- TOC entry 223 (class 1259 OID 17599)
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.products_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4580 (class 0 OID 0)
-- Dependencies: 223
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- TOC entry 247 (class 1259 OID 17866)
-- Name: shipping_modalities; Type: TABLE; Schema: public; Owner: dbmasteruser
-- 
-- Tabela: Modalidades de frete disponíveis (Melhor Envio)
-- 
-- Armazena as modalidades de frete disponíveis sincronizadas do Melhor Envio.
-- Usado para filtrar e habilitar/desabilitar modalidades específicas no sistema.
-- 
-- Campos importantes:
--   - environment: ambiente ('sandbox' ou 'production')
--   - name: nome da modalidade (ex: "PAC", "SEDEX", "Jadlog")
--   - company_id: ID da empresa no Melhor Envio
--   - company_name: nome da empresa transportadora
--   - active: se false, modalidade não é oferecida no checkout
-- 
-- Regras de negócio:
--   - Modalidades são sincronizadas do Melhor Envio via API
--   - Sincronização ocorre separadamente por ambiente
--   - Modalidades inativas não aparecem como opções de frete
--   - Usado em conjunto com shipping_rules para aplicar regras de negócio
--   - Atualizado via POST /api/settings/shipping-modalities/sync
-- 
-- Índices:
--   - idx_shipping_modalities_environment: para consultas por ambiente
--   - idx_shipping_modalities_active: para filtros de modalidades ativas
--

CREATE TABLE public.shipping_modalities (
    id bigint NOT NULL,
    environment character varying(20) NOT NULL,
    name character varying(255),
    company_id bigint,
    company_name character varying(255),
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.shipping_modalities OWNER TO dbmasteruser;

--
-- TOC entry 232 (class 1259 OID 17674)
-- Name: shipping_rules; Type: TABLE; Schema: public; Owner: dbmasteruser
-- 
-- Tabela: Regras de frete personalizadas
-- 
-- Permite criar regras de negócio para cálculo de frete, incluindo descontos,
-- prazos de produção e filtros por modalidade. Regras são avaliadas por prioridade.
-- 
-- Campos importantes:
--   - rule_type: tipo de regra ('free_shipping', 'discount', 'production_days', 'method_filter')
--   - condition_type: tipo de condição ('min_value', 'cep', 'state', 'all')
--   - condition_value: valor da condição em JSON (ex: {"min": 100.00} ou {"states": ["SP", "RJ"]})
--   - discount_type: tipo de desconto ('percentage' ou 'fixed')
--   - discount_value: valor do desconto (porcentagem ou valor fixo)
--   - shipping_methods: array JSON de IDs de modalidades permitidas/bloqueadas
--   - production_days: dias úteis adicionais de produção antes do envio
--   - priority: prioridade da regra (maior número = maior prioridade)
--   - active: se false, regra não é aplicada
-- 
-- Regras de negócio:
--   - Regras são avaliadas em ordem de prioridade (maior primeiro)
--   - Primeira regra que corresponde à condição é aplicada
--   - Múltiplas condições podem ser combinadas (AND logic)
--   - Descontos são aplicados sobre o valor do frete calculado pelo Melhor Envio
--   - production_days adiciona dias ao prazo de entrega
--   - shipping_methods pode filtrar quais modalidades são oferecidas
--   - Regras inativas são ignoradas
-- 
-- Exemplos de uso:
--   - Frete grátis para pedidos acima de R$ 200 em SP
--   - Desconto de 50% no frete para CEPs específicos
--   - Adicionar 2 dias de produção para pedidos com produtos personalizados
--   - Bloquear modalidade PAC para pedidos acima de R$ 500
-- 
-- Índices:
--   - idx_shipping_rules_active: para consultas rápidas de regras ativas
--   - idx_shipping_rules_priority: para ordenação por prioridade
--

CREATE TABLE public.shipping_rules (
    id bigint NOT NULL,
    rule_type character varying(50) NOT NULL,
    condition_type character varying(50) NOT NULL,
    condition_value jsonb,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    discount_type character varying(20),
    discount_value numeric(10,2) DEFAULT 0,
    shipping_methods jsonb,
    production_days integer DEFAULT 0,
    priority integer DEFAULT 0
);


ALTER TABLE public.shipping_rules OWNER TO dbmasteruser;

--
-- TOC entry 231 (class 1259 OID 17673)
-- Name: shipping_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.shipping_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.shipping_rules_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4581 (class 0 OID 0)
-- Dependencies: 231
-- Name: shipping_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.shipping_rules_id_seq OWNED BY public.shipping_rules.id;


--
-- TOC entry 238 (class 1259 OID 17736)
-- Name: system_logs; Type: TABLE; Schema: public; Owner: dbmasteruser
-- 
-- Tabela: Logs do sistema
-- 
-- Armazena logs de eventos do sistema para auditoria, debug e monitoramento.
-- Logs são categorizados por tipo e nível de severidade.
-- 
-- Campos importantes:
--   - level: nível do log ('info', 'warn', 'error', 'debug')
--   - message: mensagem do log (obrigatório)
--   - metadata: dados adicionais em JSON (texto)
--   - category: categoria do log ('api', 'payment', 'shipping', 'bling', 'integration', etc.)
--   - created_at: timestamp de quando o log foi criado
-- 
-- Regras de negócio:
--   - Logs são criados automaticamente pelo sistema
--   - Logs de erro são mantidos por mais tempo que logs de info/debug
--   - Logs podem ser consultados via GET /api/logs
--   - Metadata contém informações contextuais (IDs, valores, etc.)
--   - Usado para rastreamento de problemas e auditoria
-- 
-- Índices:
--   - idx_system_logs_level: para filtros por nível
--   - idx_system_logs_category: para filtros por categoria
--   - idx_system_logs_created_at: para consultas por data
--

CREATE TABLE public.system_logs (
    id bigint NOT NULL,
    level character varying(20) NOT NULL,
    message text NOT NULL,
    metadata text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    category character varying(50)
);


ALTER TABLE public.system_logs OWNER TO dbmasteruser;

--
-- TOC entry 237 (class 1259 OID 17735)
-- Name: system_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.system_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.system_logs_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4582 (class 0 OID 0)
-- Dependencies: 237
-- Name: system_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.system_logs_id_seq OWNED BY public.system_logs.id;


--
-- TOC entry 242 (class 1259 OID 17778)
-- Name: system_settings; Type: TABLE; Schema: public; Owner: dbmasteruser
-- 
-- Tabela: Configurações gerais do sistema
-- 
-- Armazena configurações chave-valor do sistema. Usado para armazenar
-- preferências globais e configurações que não se encaixam em outras tabelas.
-- 
-- Campos importantes:
--   - key: chave única da configuração (obrigatório, único)
--   - value: valor da configuração em texto (obrigatório)
--   - description: descrição do que a configuração faz (opcional)
-- 
-- Regras de negócio:
--   - Chave é única (constraint UNIQUE)
--   - Valores são armazenados como texto (conversão feita no backend)
--   - Usado para configurações globais que não mudam frequentemente
--   - Exemplos: URLs de APIs, limites de sistema, flags de feature
-- 
-- Índices:
--   - idx_system_settings_key_unique: garante unicidade da chave
--

CREATE TABLE public.system_settings (
    id bigint NOT NULL,
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.system_settings OWNER TO dbmasteruser;

--
-- TOC entry 241 (class 1259 OID 17777)
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: dbmasteruser
--

CREATE SEQUENCE public.system_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.system_settings_id_seq OWNER TO dbmasteruser;

--
-- TOC entry 4583 (class 0 OID 0)
-- Dependencies: 241
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dbmasteruser
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


--
-- TOC entry 4237 (class 2604 OID 17561)
-- Name: admins id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.admins ALTER COLUMN id SET DEFAULT nextval('public.admins_id_seq'::regclass);


--
-- TOC entry 4304 (class 2604 OID 18178)
-- Name: bling_contact_import_jobs id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.bling_contact_import_jobs ALTER COLUMN id SET DEFAULT nextval('public.bling_contact_import_jobs_id_seq'::regclass);


--
-- TOC entry 4272 (class 2604 OID 17688)
-- Name: bling_sync_logs id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.bling_sync_logs ALTER COLUMN id SET DEFAULT nextval('public.bling_sync_logs_id_seq'::regclass);


--
-- TOC entry 4298 (class 2604 OID 17883)
-- Name: bling_sync_status id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.bling_sync_status ALTER COLUMN id SET DEFAULT nextval('public.bling_sync_status_id_seq'::regclass);


--
-- TOC entry 4242 (class 2604 OID 17586)
-- Name: client_addresses id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.client_addresses ALTER COLUMN id SET DEFAULT nextval('public.client_addresses_id_seq'::regclass);


--
-- TOC entry 4239 (class 2604 OID 17573)
-- Name: clients id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.clients ALTER COLUMN id SET DEFAULT nextval('public.clients_id_seq'::regclass);


--
-- TOC entry 4290 (class 2604 OID 17820)
-- Name: installment_rates id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.installment_rates ALTER COLUMN id SET DEFAULT nextval('public.installment_rates_id_seq'::regclass);


--
-- TOC entry 4278 (class 2604 OID 17751)
-- Name: integration_tokens id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.integration_tokens ALTER COLUMN id SET DEFAULT nextval('public.integration_tokens_id_seq'::regclass);


--
-- TOC entry 4274 (class 2604 OID 17703)
-- Name: order_history id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.order_history ALTER COLUMN id SET DEFAULT nextval('public.order_history_id_seq'::regclass);


--
-- TOC entry 4258 (class 2604 OID 17641)
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- TOC entry 4250 (class 2604 OID 17615)
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- TOC entry 4286 (class 2604 OID 17810)
-- Name: payment_settings id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.payment_settings ALTER COLUMN id SET DEFAULT nextval('public.payment_settings_id_seq'::regclass);


--
-- TOC entry 4261 (class 2604 OID 17662)
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- TOC entry 4301 (class 2604 OID 17896)
-- Name: product_categories id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.product_categories ALTER COLUMN id SET DEFAULT nextval('public.product_categories_id_seq'::regclass);


--
-- TOC entry 4246 (class 2604 OID 17603)
-- Name: products id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- TOC entry 4265 (class 2604 OID 17677)
-- Name: shipping_rules id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.shipping_rules ALTER COLUMN id SET DEFAULT nextval('public.shipping_rules_id_seq'::regclass);


--
-- TOC entry 4276 (class 2604 OID 17739)
-- Name: system_logs id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.system_logs ALTER COLUMN id SET DEFAULT nextval('public.system_logs_id_seq'::regclass);


--
-- TOC entry 4283 (class 2604 OID 17781)
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


--
-- TOC entry 4316 (class 2606 OID 17568)
-- Name: admins admins_email_key; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);


--
-- TOC entry 4318 (class 2606 OID 17566)
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- TOC entry 4392 (class 2606 OID 18192)
-- Name: bling_contact_import_jobs bling_contact_import_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.bling_contact_import_jobs
    ADD CONSTRAINT bling_contact_import_jobs_pkey PRIMARY KEY (id);


--
-- TOC entry 4351 (class 2606 OID 17693)
-- Name: bling_sync_logs bling_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.bling_sync_logs
    ADD CONSTRAINT bling_sync_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4384 (class 2606 OID 17889)
-- Name: bling_sync_status bling_sync_status_entity_type_key; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.bling_sync_status
    ADD CONSTRAINT bling_sync_status_entity_type_key UNIQUE (entity_type);


--
-- TOC entry 4386 (class 2606 OID 17887)
-- Name: bling_sync_status bling_sync_status_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.bling_sync_status
    ADD CONSTRAINT bling_sync_status_pkey PRIMARY KEY (id);


--
-- TOC entry 4328 (class 2606 OID 17593)
-- Name: client_addresses client_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.client_addresses
    ADD CONSTRAINT client_addresses_pkey PRIMARY KEY (id);


--
-- TOC entry 4320 (class 2606 OID 17581)
-- Name: clients clients_cpf_key; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_cpf_key UNIQUE (cpf);


--
-- TOC entry 4322 (class 2606 OID 17579)
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- TOC entry 4376 (class 2606 OID 17827)
-- Name: installment_rates installment_rates_installments_environment_key; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.installment_rates
    ADD CONSTRAINT installment_rates_installments_environment_key UNIQUE (installments, environment);


--
-- TOC entry 4378 (class 2606 OID 17825)
-- Name: installment_rates installment_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.installment_rates
    ADD CONSTRAINT installment_rates_pkey PRIMARY KEY (id);


--
-- TOC entry 4365 (class 2606 OID 17759)
-- Name: integration_tokens integration_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.integration_tokens
    ADD CONSTRAINT integration_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 4367 (class 2606 OID 17761)
-- Name: integration_tokens integration_tokens_provider_environment_key; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.integration_tokens
    ADD CONSTRAINT integration_tokens_provider_environment_key UNIQUE (provider, environment);


--
-- TOC entry 4355 (class 2606 OID 17708)
-- Name: order_history order_history_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.order_history
    ADD CONSTRAINT order_history_pkey PRIMARY KEY (id);


--
-- TOC entry 4341 (class 2606 OID 17647)
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- TOC entry 4338 (class 2606 OID 17626)
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- TOC entry 4374 (class 2606 OID 17815)
-- Name: payment_settings payment_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.payment_settings
    ADD CONSTRAINT payment_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4344 (class 2606 OID 17667)
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- TOC entry 4390 (class 2606 OID 17902)
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (id);


--
-- TOC entry 4332 (class 2606 OID 17610)
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- TOC entry 4382 (class 2606 OID 17875)
-- Name: shipping_modalities shipping_modalities_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.shipping_modalities
    ADD CONSTRAINT shipping_modalities_pkey PRIMARY KEY (id, environment);


--
-- TOC entry 4349 (class 2606 OID 17683)
-- Name: shipping_rules shipping_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.shipping_rules
    ADD CONSTRAINT shipping_rules_pkey PRIMARY KEY (id);


--
-- TOC entry 4360 (class 2606 OID 17744)
-- Name: system_logs system_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.system_logs
    ADD CONSTRAINT system_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4370 (class 2606 OID 17789)
-- Name: system_settings system_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_key UNIQUE (key);


--
-- TOC entry 4372 (class 2606 OID 17787)
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4393 (class 1259 OID 18194)
-- Name: idx_bling_contact_import_jobs_started_at; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_bling_contact_import_jobs_started_at ON public.bling_contact_import_jobs USING btree (started_at DESC);


--
-- TOC entry 4394 (class 1259 OID 18193)
-- Name: idx_bling_contact_import_jobs_status; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_bling_contact_import_jobs_status ON public.bling_contact_import_jobs USING btree (status);


--
-- TOC entry 4352 (class 1259 OID 17726)
-- Name: idx_bling_sync_logs_order_id; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_bling_sync_logs_order_id ON public.bling_sync_logs USING btree (order_id);


--
-- TOC entry 4387 (class 1259 OID 17890)
-- Name: idx_bling_sync_status_entity_type; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_bling_sync_status_entity_type ON public.bling_sync_status USING btree (entity_type);


--
-- TOC entry 4329 (class 1259 OID 17720)
-- Name: idx_client_addresses_client_id; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_client_addresses_client_id ON public.client_addresses USING btree (client_id);


--
-- TOC entry 4323 (class 1259 OID 17951)
-- Name: idx_clients_bling_contact_id; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_clients_bling_contact_id ON public.clients USING btree (bling_contact_id) WHERE (bling_contact_id IS NOT NULL);


--
-- TOC entry 4324 (class 1259 OID 17950)
-- Name: idx_clients_bling_contact_id_unique; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE UNIQUE INDEX idx_clients_bling_contact_id_unique ON public.clients USING btree (bling_contact_id) WHERE (bling_contact_id IS NOT NULL);


--
-- TOC entry 4325 (class 1259 OID 17981)
-- Name: idx_clients_cnpj_unique; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE UNIQUE INDEX idx_clients_cnpj_unique ON public.clients USING btree (cnpj) WHERE (cnpj IS NOT NULL);


--
-- TOC entry 4326 (class 1259 OID 17719)
-- Name: idx_clients_cpf; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_clients_cpf ON public.clients USING btree (cpf);


--
-- TOC entry 4361 (class 1259 OID 17763)
-- Name: idx_integration_tokens_environment; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_integration_tokens_environment ON public.integration_tokens USING btree (environment);


--
-- TOC entry 4362 (class 1259 OID 17764)
-- Name: idx_integration_tokens_is_active; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_integration_tokens_is_active ON public.integration_tokens USING btree (is_active);


--
-- TOC entry 4363 (class 1259 OID 17762)
-- Name: idx_integration_tokens_provider; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_integration_tokens_provider ON public.integration_tokens USING btree (provider);


--
-- TOC entry 4353 (class 1259 OID 17727)
-- Name: idx_order_history_order_id; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_order_history_order_id ON public.order_history USING btree (order_id);


--
-- TOC entry 4339 (class 1259 OID 17724)
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- TOC entry 4333 (class 1259 OID 17911)
-- Name: idx_orders_bling_sale_numero; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_orders_bling_sale_numero ON public.orders USING btree (bling_sale_numero);


--
-- TOC entry 4334 (class 1259 OID 17721)
-- Name: idx_orders_client_id; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_orders_client_id ON public.orders USING btree (client_id);


--
-- TOC entry 4335 (class 1259 OID 17723)
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at);


--
-- TOC entry 4336 (class 1259 OID 17722)
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- TOC entry 4342 (class 1259 OID 17725)
-- Name: idx_payments_order_id; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_payments_order_id ON public.payments USING btree (order_id);


--
-- TOC entry 4388 (class 1259 OID 17903)
-- Name: idx_product_categories_name; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_product_categories_name ON public.product_categories USING btree (name);


--
-- TOC entry 4330 (class 1259 OID 17909)
-- Name: idx_products_category_id; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_products_category_id ON public.products USING btree (category_id);


--
-- TOC entry 4379 (class 1259 OID 17877)
-- Name: idx_shipping_modalities_active; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_shipping_modalities_active ON public.shipping_modalities USING btree (environment, active);


--
-- TOC entry 4380 (class 1259 OID 17876)
-- Name: idx_shipping_modalities_environment; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_shipping_modalities_environment ON public.shipping_modalities USING btree (environment);


--
-- TOC entry 4345 (class 1259 OID 17851)
-- Name: idx_shipping_rules_active; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_shipping_rules_active ON public.shipping_rules USING btree (active);


--
-- TOC entry 4346 (class 1259 OID 17853)
-- Name: idx_shipping_rules_priority; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_shipping_rules_priority ON public.shipping_rules USING btree (priority);


--
-- TOC entry 4347 (class 1259 OID 17852)
-- Name: idx_shipping_rules_rule_type; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_shipping_rules_rule_type ON public.shipping_rules USING btree (rule_type);


--
-- TOC entry 4356 (class 1259 OID 17859)
-- Name: idx_system_logs_category; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_system_logs_category ON public.system_logs USING btree (category);


--
-- TOC entry 4357 (class 1259 OID 17745)
-- Name: idx_system_logs_created_at; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_system_logs_created_at ON public.system_logs USING btree (created_at);


--
-- TOC entry 4358 (class 1259 OID 17746)
-- Name: idx_system_logs_level; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_system_logs_level ON public.system_logs USING btree (level);


--
-- TOC entry 4368 (class 1259 OID 17790)
-- Name: idx_system_settings_key; Type: INDEX; Schema: public; Owner: dbmasteruser
--

CREATE INDEX idx_system_settings_key ON public.system_settings USING btree (key);


--
-- TOC entry 4414 (class 2620 OID 18195)
-- Name: bling_contact_import_jobs update_bling_contact_import_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: dbmasteruser
--

CREATE TRIGGER update_bling_contact_import_jobs_updated_at BEFORE UPDATE ON public.bling_contact_import_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4412 (class 2620 OID 17891)
-- Name: bling_sync_status update_bling_sync_status_updated_at; Type: TRIGGER; Schema: public; Owner: dbmasteruser
--

CREATE TRIGGER update_bling_sync_status_updated_at BEFORE UPDATE ON public.bling_sync_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4406 (class 2620 OID 17792)
-- Name: client_addresses update_client_addresses_updated_at; Type: TRIGGER; Schema: public; Owner: dbmasteruser
--

CREATE TRIGGER update_client_addresses_updated_at BEFORE UPDATE ON public.client_addresses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4405 (class 2620 OID 17791)
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: dbmasteruser
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4410 (class 2620 OID 17796)
-- Name: integration_tokens update_integration_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: dbmasteruser
--

CREATE TRIGGER update_integration_tokens_updated_at BEFORE UPDATE ON public.integration_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4408 (class 2620 OID 17794)
-- Name: orders update_orders_updated_at; Type: TRIGGER; Schema: public; Owner: dbmasteruser
--

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4413 (class 2620 OID 17910)
-- Name: product_categories update_product_categories_updated_at; Type: TRIGGER; Schema: public; Owner: dbmasteruser
--

CREATE TRIGGER update_product_categories_updated_at BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4407 (class 2620 OID 17793)
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: public; Owner: dbmasteruser
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4409 (class 2620 OID 17795)
-- Name: shipping_rules update_shipping_rules_updated_at; Type: TRIGGER; Schema: public; Owner: dbmasteruser
--

CREATE TRIGGER update_shipping_rules_updated_at BEFORE UPDATE ON public.shipping_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4411 (class 2620 OID 17798)
-- Name: system_settings update_system_settings_updated_at; Type: TRIGGER; Schema: public; Owner: dbmasteruser
--

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4402 (class 2606 OID 17694)
-- Name: bling_sync_logs bling_sync_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.bling_sync_logs
    ADD CONSTRAINT bling_sync_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- TOC entry 4395 (class 2606 OID 17594)
-- Name: client_addresses client_addresses_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.client_addresses
    ADD CONSTRAINT client_addresses_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- TOC entry 4403 (class 2606 OID 17714)
-- Name: order_history order_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.order_history
    ADD CONSTRAINT order_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.admins(id);


--
-- TOC entry 4404 (class 2606 OID 17709)
-- Name: order_history order_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.order_history
    ADD CONSTRAINT order_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- TOC entry 4399 (class 2606 OID 17648)
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- TOC entry 4400 (class 2606 OID 17653)
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- TOC entry 4397 (class 2606 OID 17627)
-- Name: orders orders_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- TOC entry 4398 (class 2606 OID 17632)
-- Name: orders orders_shipping_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_shipping_address_id_fkey FOREIGN KEY (shipping_address_id) REFERENCES public.client_addresses(id);


--
-- TOC entry 4401 (class 2606 OID 17668)
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- TOC entry 4396 (class 2606 OID 17904)
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dbmasteruser
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE SET NULL;


-- Concluído em 2026-02-05 12:41:28 -03

--
-- Dump do banco de dados PostgreSQL concluído
--

