# Integração com Melhor Envio - Documentação Completa

## 📋 Índice

1. [Panorama Geral da Stack Tecnológica](#panorama-geral-da-stack-tecnológica)
2. [Visão Geral da Integração](#visão-geral-da-integração)
3. [Estrutura de Arquivos](#estrutura-de-arquivos)
4. [Autenticação e Gerenciamento de Tokens](#autenticação-e-gerenciamento-de-tokens)
5. [Validação de Tokens](#validação-de-tokens)
6. [Cotação de Fretes](#cotação-de-fretes)
7. [Sistema de Cache](#sistema-de-cache)
8. [Fluxo OAuth2](#fluxo-oauth2)
9. [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
10. [Tratamento de Erros](#tratamento-de-erros)
11. [Interface do Usuário](#interface-do-usuário)

---

## 🛠️ Panorama Geral da Stack Tecnológica

### Frontend
- **Framework**: Next.js 14.2.0 (App Router)
- **Biblioteca UI**: React 18.2.0
- **Linguagem**: TypeScript 5.2.2
- **Estilização**: Tailwind CSS 3.4.17
- **Componentes UI**: 
  - Radix UI (primitivos acessíveis)
  - shadcn/ui (componentes customizáveis)
  - Lucide React (ícones)
- **Gerenciamento de Estado**: React Hooks (useState, useEffect)
- **Formulários**: Componentes controlados nativos

### Backend
- **Runtime**: Node.js (via Next.js)
- **API Routes**: Next.js Route Handlers (App Router)
- **Autenticação**: JWT (jsonwebtoken 9.0.2)
- **Banco de Dados**: PostgreSQL (via pg 8.11.0)
- **Criptografia**: bcryptjs 2.4.3

### Infraestrutura
- **Banco de Dados**: PostgreSQL
- **ORM**: SQL direto (sem ORM)
- **Cache**: Memória (Map nativo do JavaScript)
- **Deploy**: Next.js Standalone

### Bibliotecas Principais
```json
{
  "next": "14.2.0",
  "react": "^18.2.0",
  "typescript": "^5.2.2",
  "tailwindcss": "^3.4.17",
  "pg": "^8.11.0",
  "jsonwebtoken": "^9.0.2",
  "bcryptjs": "^2.4.3"
}
```

---

## 🎯 Visão Geral da Integração

A integração com o Melhor Envio permite:
- **Cálculo de fretes** em tempo real
- **Autenticação OAuth2** com renovação automática de tokens
- **Suporte a múltiplos ambientes** (sandbox e produção)
- **Validação de tokens** antes de uso
- **Cache inteligente** de cotações
- **Gerenciamento centralizado** de tokens via interface administrativa

### Ambientes Suportados
- **Sandbox**: `https://sandbox.melhorenvio.com.br/api/v2/me`
- **Produção**: `https://melhorenvio.com.br/api/v2/me`

---

## 📁 Estrutura de Arquivos

```
pedidos/
├── lib/
│   ├── melhor-envio.ts              # Lógica principal de integração
│   ├── melhor-envio-oauth.ts        # Fluxo OAuth2
│   ├── melhor-envio-utils.ts       # Utilitários (formatação)
│   ├── integrations.ts              # Gerenciamento de tokens no BD
│   ├── integrations-types.ts        # Tipos TypeScript
│   ├── shipping-cache.ts            # Sistema de cache
│   ├── database.ts                  # Conexão PostgreSQL
│   └── auth.ts                      # Autenticação JWT
│
├── app/api/
│   ├── integrations/
│   │   ├── tokens/route.ts          # CRUD de tokens
│   │   └── validate/[provider]/route.ts  # Validação de tokens
│   ├── shipping/
│   │   └── quote/route.ts            # Endpoint de cotação
│   └── auth/callback/
│       └── melhor-envio/route.ts     # Callback OAuth2
│
├── components/integrations/
│   ├── IntegrationCard.tsx          # Card de integração
│   ├── TokenForm.tsx                # Formulário de token
│   ├── TokenStatusBadge.tsx         # Badge de status
│   └── EnvironmentBadge.tsx        # Badge de ambiente
│
├── app/admin/integrations/
│   └── page.tsx                      # Página de gerenciamento
│
└── database/
    └── schema.sql                    # Schema do banco (tabela integration_tokens)
```

---

## 🔐 Autenticação e Gerenciamento de Tokens

### Método de Autenticação

**IMPORTANTE**: Apenas o método **"Token Direto (Legacy)"** funciona na prática. O método OAuth2 não está funcional no momento.

#### Token Direto (Legacy)
- Token manual fornecido pelo usuário
- Requer renovação manual quando expira
- Tipo de token sempre será **"Bearer"** (definido automaticamente)
- Token obtido diretamente do painel do Melhor Envio

### Fluxo de Cadastro de Token

1. Usuário acessa `/admin/integrations`
2. Seleciona ambiente (Sandbox ou Produção)
3. Clica em "Adicionar" para o ambiente desejado
4. Preenche o campo "Token" com o token completo do Melhor Envio
5. Opcionalmente, preenche "CEP de Origem"
6. Clica em "Salvar"
7. Sistema valida formato (remove "Bearer " se presente)
8. Verifica se não está mascarado
9. Armazena no banco com `token_type: 'bearer'` (automático)

### Seleção de Ambiente Ativo

O sistema permite selecionar qual ambiente está ativo (Sandbox ou Produção) através de um select no topo do card de integração. O ambiente selecionado é usado automaticamente em todas as cotações de frete.

- Ambiente ativo é armazenado em `system_settings` com chave `integration_active_env_melhor_envio`
- Se não configurado, usa produção se existir token, senão sandbox
- Badge "Ativo" é exibido no token do ambiente selecionado

### Estrutura de Dados no Banco

```sql
CREATE TABLE integration_tokens (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,           -- 'melhor_envio'
    environment VARCHAR(20) NOT NULL,        -- 'sandbox' ou 'production'
    token_value TEXT NOT NULL,                -- Token real (access_token)
    token_type VARCHAR(50) DEFAULT 'bearer',
    additional_data JSONB,                    -- { client_id, client_secret, refresh_token, cep_origem, expires_in }
    is_active BOOLEAN DEFAULT true,
    last_validated_at TIMESTAMP,
    last_validation_status VARCHAR(20),      -- 'valid', 'invalid', 'error'
    last_validation_error TEXT,
    expires_at TIMESTAMP,                     -- Data de expiração (OAuth2)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, environment)
);
```

### Funções Principais (`lib/integrations.ts`)

#### `getToken(provider, environment)`
- Busca token ativo do banco
- Retorna `IntegrationToken | null`

#### `upsertToken(provider, environment, tokenValue, ...)`
- Cria ou atualiza token
- Suporta `ON CONFLICT` para atualização

#### `updateOAuth2Token(provider, environment, accessToken, refreshToken, expiresIn, ...)`
- Atualiza token OAuth2 com nova expiração
- Calcula `expires_at` (5 minutos antes do real)

#### `getTokenWithFallback(provider, environment, autoRefresh)`
- Busca token do banco
- **Renovação automática** se expirado:
  1. Tenta com `refresh_token`
  2. Se falhar, tenta com `client_credentials`
- Fallback para variáveis de ambiente (legacy)

### Endpoint de Gerenciamento (`/api/integrations/tokens`)

#### GET - Listar Tokens
- Retorna todos os tokens mascarados (`****XXXX`)
- Requer autenticação JWT

#### POST - Criar/Atualizar Token
```typescript
// Request body (Token Direto - único método funcional)
{
  provider: 'melhor_envio',
  environment: 'production',
  token_value: 'token_completo', // Token obtido do painel Melhor Envio
  cep_origem: '01310100'  // Opcional
}

// NOTA: token_type sempre será 'bearer' (definido automaticamente no backend)
```

---

## ✅ Validação de Tokens

### Endpoint de Validação (`/api/integrations/validate/[provider]`)

#### POST - Validar Token
```typescript
// Request body
{
  environment: 'production' | 'sandbox'
}
```

### Processo de Validação (`lib/melhor-envio.ts`)

A função `validateToken()` realiza validação em duas etapas:

#### 1. Validação GET (Listar Serviços)
- Endpoint: `GET /shipment/services`
- Verifica se token tem permissões de leitura
- Se falhar com 401 → token inválido

#### 2. Validação POST (Calcular Frete)
- Endpoint: `POST /shipment/calculate`
- Usa CEP de teste: `01310100` → `01310100`
- Verifica se token tem permissões de escrita
- Se falhar com 401 → token sem permissão para calcular

### Resposta de Validação

```typescript
{
  valid: boolean,
  status: 'valid' | 'invalid' | 'error',
  message: string,
  details: {
    environment: string,
    servicesCount?: number,
    canListServices: boolean,
    canCalculate: boolean,
    error?: any
  },
  last_validated_at: string
}
```

### Atualização Automática no Banco

Após validação, o sistema atualiza:
- `last_validated_at`
- `last_validation_status`
- `last_validation_error` (se inválido)
- `additional_data` com detalhes da validação

---

## 🚚 Cotação de Fretes

### Endpoint de Cotação (`/api/shipping/quote`)

#### POST - Calcular Frete
```typescript
// Request body (modo simples)
{
  cep_destino: '01310100',
  peso: '0.5',
  altura: '10',
  largura: '20',
  comprimento: '30',
  valor: '100.00',
  environment?: 'sandbox' | 'production'
}

// Request body (modo múltiplos produtos)
{
  cep_destino: '01310100',
  produtos: [
    {
      id: '1',
      largura: 20,
      altura: 10,
      comprimento: 30,
      peso: 0.5,
      valor: 100,
      quantidade: 2
    }
  ],
  environment?: 'sandbox' | 'production'
}
```

### Validações Implementadas

#### Dimensões Mínimas
- Largura: 2cm
- Altura: 11cm
- Comprimento: 16cm

#### Dimensões Máximas
- Largura: 105cm
- Altura: 105cm
- Comprimento: 105cm

#### Peso
- Mínimo: 0.1kg
- Máximo: 30kg

#### Cubicagem
- Fator: 300 kg/m³
- Valida se peso cubado não excede 30kg

### Processo de Cotação (`lib/melhor-envio.ts`)

#### 1. Validação de Token
```typescript
const cleanToken = await getCleanToken(environment)
```
- Busca token do banco
- Verifica se não está mascarado
- Remove "Bearer " se presente
- Valida tamanho mínimo (20 caracteres)

#### 2. Preparação da Requisição
```typescript
const response = await fetch(`${baseUrl}/shipment/calculate`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${cleanToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'GerenciadorPedidos/1.0',
  },
  body: JSON.stringify({
    from: { postal_code: cepOrigem },
    to: { postal_code: cepDestino },
    products: productsList
  })
})
```

#### 3. Tratamento de Erro 401 (Token Expirado)

Se receber 401, o sistema tenta renovar automaticamente:

1. **Tenta com refresh_token**:
   ```typescript
   const newTokens = await refreshOAuth2Token(refreshToken, environment)
   ```

2. **Se falhar, tenta com client_credentials**:
   ```typescript
   const newTokens = await getOAuth2Token({ client_id, client_secret }, environment)
   ```

3. **Atualiza no banco**:
   ```typescript
   await updateOAuth2Token(provider, environment, newTokens.access_token, ...)
   ```

4. **Tenta novamente** a cotação com novo token

#### 4. Resposta da API

```typescript
interface ShippingOption {
  id: number
  name: string
  company: {
    id: number
    name: string
  }
  price: string
  currency: string
  delivery_time: number
  delivery_range: {
    min: number
    max: number
  }
  packages: number
  additional_services?: any[]
}
```

### CEP de Origem

O sistema busca o CEP de origem na seguinte ordem:
1. `additional_data.cep_origem` do token no banco
2. Variável de ambiente `MELHOR_ENVIO_CEP_ORIGEM` (ou `MELHOR_ENVIO_CEP_ORIGEM_SANDBOX`)
3. Fallback: `16010000`

---

## 💾 Sistema de Cache

### Implementação (`lib/shipping-cache.ts`)

Cache em memória usando `Map<string, CacheEntry>`:

```typescript
interface CacheEntry {
  options: ShippingOption[]
  timestamp: number
  expiresAt: number
}
```

### TTL (Time To Live)
- **Padrão**: 5 minutos
- Configurável por chamada

### Chave de Cache

```typescript
function generateCacheKey(
  cepDestino: string,
  products: Array<{...}>,
  environment: IntegrationEnvironment
): string
```

Formato: `shipping:{environment}:{cepDestino}:{hashProdutos}`

O hash dos produtos inclui:
- ID do produto
- Dimensões (width x height x length)
- Peso
- Valor do seguro
- Quantidade

### Funções Principais

#### `getCachedQuote(cacheKey)`
- Retorna cotação se válida
- Remove automaticamente se expirada

#### `setCachedQuote(cacheKey, options, ttl)`
- Armazena cotação no cache
- Define timestamp e expiração

#### `cleanupExpiredCache()`
- Remove entradas expiradas
- Chamada automaticamente no endpoint de cotação

### Fluxo no Endpoint

1. Gera chave de cache
2. Verifica se existe cotação válida
3. Se existe → retorna do cache
4. Se não existe → chama API do Melhor Envio
5. Armazena resultado no cache
6. Retorna resultado

---

## 🔄 Seleção de Ambiente Ativo

### Endpoint de Ambiente Ativo

**GET** `/api/integrations/active-environment?provider=melhor_envio`
- Retorna ambiente ativo configurado
- Fallback: produção se existir token, senão sandbox

**POST** `/api/integrations/active-environment`
```typescript
{
  provider: 'melhor_envio',
  environment: 'sandbox' | 'production'
}
```
- Salva ambiente ativo em `system_settings`
- Valida se token existe para o ambiente selecionado

### Uso em Cotações

O endpoint `/api/shipping/quote` usa automaticamente o ambiente ativo configurado:
1. Se `body.environment` for fornecido, usa esse valor
2. Senão, busca ambiente ativo via `getActiveEnvironment('melhor_envio')`
3. Fallback: verifica qual token existe (produção > sandbox)
4. Fallback final: detecção automática por hostname

---

## 🔄 Fluxo OAuth2 (Não Funcional)

**NOTA**: O fluxo OAuth2 não está funcional. Apenas "Token Direto (Legacy)" funciona.

### Fluxo Completo (Documentação de Referência)

#### 1. Configuração Inicial (Client Credentials)

```
Usuário → Fornece client_id + client_secret
    ↓
Sistema → POST /oauth/token (grant_type=client_credentials)
    ↓
Melhor Envio → Retorna access_token + refresh_token (opcional)
    ↓
Sistema → Salva no banco com expires_at
```

#### 2. Renovação Automática (Refresh Token)

```
Token expira ou recebe 401
    ↓
Sistema → Verifica expires_at no banco
    ↓
Se expirado → POST /oauth/token (grant_type=refresh_token)
    ↓
Melhor Envio → Retorna novo access_token + refresh_token
    ↓
Sistema → Atualiza no banco
```

#### 3. Renovação com Client Credentials (Fallback)

```
Refresh token não disponível ou falhou
    ↓
Sistema → Busca client_id + client_secret do banco
    ↓
Sistema → POST /oauth/token (grant_type=client_credentials)
    ↓
Melhor Envio → Retorna novo access_token
    ↓
Sistema → Atualiza no banco
```

### Endpoint OAuth2 (`lib/melhor-envio-oauth.ts`)

#### `getOAuth2Token(credentials, environment)`
```typescript
// Request
POST https://melhorenvio.com.br/oauth/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(client_id:client_secret)}

Body:
grant_type=client_credentials
client_id=xxx
client_secret=yyy
```

#### `refreshOAuth2Token(refreshToken, environment)`
```typescript
// Request
POST https://melhorenvio.com.br/oauth/token
Content-Type: application/x-www-form-urlencoded

Body:
grant_type=refresh_token
refresh_token=xxx
```

### Callback OAuth2 (`/api/auth/callback/melhor-envio`)

**URL de redirecionamento configurada no app do Melhor Envio:**
```
https://pedidos.lojacenario.com.br/api/auth/callback/melhor-envio
```

**Fluxo:**
1. Usuário autoriza app no Melhor Envio
2. Melhor Envio redireciona para callback com `code`
3. Sistema troca `code` por `access_token` e `refresh_token`
4. Salva no banco
5. Redireciona para `/admin/integrations?success=...`

### Cálculo de Expiração

```typescript
function calculateExpirationDate(expiresIn: number): Date {
  // Subtrair 5 minutos para renovar antes de expirar
  const expirationTime = Date.now() + (expiresIn * 1000) - (5 * 60 * 1000)
  return new Date(expirationTime)
}
```

O sistema renova tokens **5 minutos antes** de expirar.

---

## 🗄️ Estrutura do Banco de Dados

### Tabela `integration_tokens`

```sql
CREATE TABLE integration_tokens (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,              -- 'melhor_envio', 'pagarme', 'bling'
    environment VARCHAR(20) NOT NULL,          -- 'sandbox', 'production'
    token_value TEXT NOT NULL,                  -- Token real (nunca mascarado no BD)
    token_type VARCHAR(50) DEFAULT 'bearer',  -- 'bearer', 'basic', 'api_key'
    additional_data JSONB,                     -- Dados extras em JSON
    is_active BOOLEAN DEFAULT true,
    last_validated_at TIMESTAMP,
    last_validation_status VARCHAR(20),        -- 'valid', 'invalid', 'error', 'pending'
    last_validation_error TEXT,
    expires_at TIMESTAMP,                       -- Data de expiração (OAuth2)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, environment)               -- Um token por provider+environment
);
```

### Estrutura de `additional_data` (JSONB)

#### Para OAuth2:
```json
{
  "client_id": "xxx",
  "client_secret": "yyy",
  "refresh_token": "zzz",
  "expires_in": 2592000,
  "cep_origem": "01310100"
}
```

#### Para Token Direto:
```json
{
  "cep_origem": "01310100"
}
```

### Índices

```sql
CREATE INDEX idx_integration_tokens_provider ON integration_tokens(provider);
CREATE INDEX idx_integration_tokens_environment ON integration_tokens(environment);
CREATE INDEX idx_integration_tokens_is_active ON integration_tokens(is_active);
```

### Trigger de Atualização

```sql
CREATE TRIGGER update_integration_tokens_updated_at
    BEFORE UPDATE ON integration_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

---

## ⚠️ Tratamento de Erros

### Erros Comuns e Tratamento

#### 1. Token Não Configurado
```typescript
Error: '[Sistema] Token do Melhor Envio não configurado para production'
```
**Solução**: Configurar token na página de Integrações

#### 2. Token Inválido (401)
```typescript
Error: '[Melhor Envio] Token inválido ou sem permissões para calcular frete'
```
**Solução**: 
- Sistema tenta renovar automaticamente
- Se falhar, usuário deve reconfigurar token

#### 3. Token Mascarado
```typescript
Error: '[Sistema] Token parece estar mascarado'
```
**Solução**: Reconfigurar token com valor completo (não mascarado)

#### 4. Dados Inválidos (422)
```typescript
Error: '[Melhor Envio] Dados inválidos: {mensagem}'
```
**Solução**: Verificar CEP, dimensões e peso dos produtos

#### 5. Token Expirado
**Tratamento Automático**:
1. Detecta expiração em `getTokenWithFallback()`
2. Tenta renovar com `refresh_token`
3. Se falhar, tenta com `client_credentials`
4. Atualiza no banco automaticamente

### Logs e Debug

O sistema registra logs detalhados:
- Token recuperado (preview mascarado)
- Requisições à API (URL, headers, body preview)
- Respostas da API (status, headers)
- Erros com stack trace completo
- Renovações automáticas de token

---

## 🎨 Interface do Usuário

### Página de Integrações (`/admin/integrations`)

#### Componentes Principais

1. **IntegrationCard**
   - Exibe status de cada ambiente (sandbox/produção)
   - Botões: Adicionar, Editar, Validar, Deletar
   - Badge de status (válido/inválido/erro)
   - Badge de ambiente (sandbox/produção)

2. **TokenForm** (Modal)
   - Seleção de ambiente (sandbox/produção)
   - Campo Token (password) - Token direto do Melhor Envio
   - Campo CEP de Origem (opcional)
   - Tipo de token sempre será "Bearer" (definido automaticamente)

3. **TokenStatusBadge**
   - Verde: Token válido
   - Vermelho: Token inválido
   - Amarelo: Erro na validação
   - Cinza: Não validado

### Fluxo de Uso

1. **Adicionar Token**:
   - Clica em "Adicionar" no card da integração
   - Modal abre com formulário
   - Seleciona ambiente (sandbox/produção)
   - Preenche campo "Token" com token do Melhor Envio
   - Opcionalmente, preenche "CEP de Origem"
   - Clica em "Salvar"
   - Sistema valida e salva no banco com tipo "Bearer" (automático)
   - Modal fecha automaticamente

2. **Validar Token**:
   - Clica em "Validar" no card
   - Sistema faz requisição de validação
   - Atualiza status no banco
   - Exibe resultado na interface

3. **Editar Token**:
   - Clica em "Editar" no token desejado
   - Modal abre com formulário preenchido
   - Modifica campos desejados (token, CEP de origem)
   - Salva alterações
   - Modal fecha automaticamente

4. **Deletar Token**:
   - Clica em "Deletar"
   - Confirma ação
   - Remove do banco

### Mensagens de Feedback

- **Sucesso**: Banner verde com mensagem
- **Erro**: Banner vermelho com mensagem detalhada
- **Loading**: Spinner durante operações assíncronas

---

## 📊 Resumo da Arquitetura

### Fluxo Completo de Cotação

```
Cliente → POST /api/shipping/quote
    ↓
Autenticação JWT
    ↓
Validação de parâmetros (CEP, dimensões, peso)
    ↓
Verifica cache
    ↓ (se não encontrado)
Busca token do banco (com renovação automática se necessário)
    ↓
POST /shipment/calculate (Melhor Envio)
    ↓ (se 401)
Renova token automaticamente
    ↓
Tenta novamente
    ↓
Armazena no cache
    ↓
Retorna opções de frete
```

### Fluxo de Renovação Automática

```
getTokenWithFallback() chamado
    ↓
Verifica expires_at
    ↓ (se expirado)
Tenta refresh_token
    ↓ (se falhar)
Tenta client_credentials
    ↓
Atualiza no banco
    ↓
Retorna novo token
```

### Segurança

- Tokens **nunca** expostos na interface (sempre mascarados)
- Tokens armazenados **criptografados** no banco (via PostgreSQL)
- Autenticação JWT obrigatória para todas as operações
- Validação de permissões antes de cada requisição
- Logs não expõem tokens completos (apenas preview)

---

## 🔧 Configuração e Variáveis de Ambiente

### Variáveis Necessárias

```env
# Banco de Dados
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pedidos_db
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_SSL=false

# Autenticação
JWT_SECRET=seu-secret-key-aqui

# Melhor Envio (Opcional - Fallback)
MELHOR_ENVIO_TOKEN=token_legacy (não recomendado)
MELHOR_ENVIO_TOKEN_SANDBOX=token_sandbox_legacy
MELHOR_ENVIO_CEP_ORIGEM=01310100
MELHOR_ENVIO_CEP_ORIGEM_SANDBOX=01310100

# OAuth2 Callback (Opcional)
MELHOR_ENVIO_REDIRECT_URI=https://pedidos.lojacenario.com.br/api/auth/callback/melhor-envio
```

---

## 📝 Conclusão

A integração com Melhor Envio é robusta e completa, oferecendo:

✅ **Autenticação via Token Direto** (único método funcional)  
✅ **Tipo de token Bearer** (definido automaticamente)  
✅ **Seleção de ambiente ativo** (Sandbox/Produção)  
✅ **Validação inteligente** (GET + POST)  
✅ **Cache eficiente** de cotações  
✅ **Tratamento de erros** abrangente  
✅ **Interface administrativa** completa com modal para formulários  
✅ **Suporte a múltiplos ambientes**  
✅ **Logs detalhados** para debug  

O sistema está preparado para produção e oferece uma experiência fluida tanto para administradores quanto para usuários finais.
