# Integração com Pagar.me - Documentação Completa

## Índice

1. [Panorama Geral da Stack Tecnológica](#panorama-geral-da-stack-tecnológica)
2. [Visão Geral da Integração](#visão-geral-da-integração)
3. [Estrutura de Arquivos](#estrutura-de-arquivos)
4. [Autenticação e Gerenciamento de Tokens](#autenticação-e-gerenciamento-de-tokens)
5. [Criação de Transações](#criação-de-transações)
6. [Fluxo PIX](#fluxo-pix)
7. [Fluxo Cartão de Crédito](#fluxo-cartão-de-crédito)
8. [Webhooks](#webhooks)
9. [Polling de Status](#polling-de-status)
10. [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
11. [Tratamento de Erros](#tratamento-de-erros)
12. [Interface do Usuário](#interface-do-usuário)

---

## Panorama Geral da Stack Tecnológica

### Frontend
- **Framework**: Next.js 14.2.0 (App Router)
- **Biblioteca UI**: React 18.2.0
- **Linguagem**: TypeScript 5.2.2
- **Estilização**: Tailwind CSS 3.4.17
- **Componentes UI**: shadcn/ui (Radix UI)
- **Ícones**: Lucide React
- **Notificações**: Sonner (toasts)

### Backend
- **Runtime**: Node.js (via Next.js)
- **API Routes**: Next.js Route Handlers (App Router)
- **Banco de Dados**: PostgreSQL (via pg 8.11.0)
- **Autenticação**: JWT (jsonwebtoken 9.0.2)

### Integração Pagar.me
- **API**: Pagar.me Core API v5
- **Métodos**: PIX e Cartão de Crédito
- **Autenticação**: HTTP Basic Auth (secret_key)
- **Tokenização**: Public Key para frontend

---

## Visão Geral da Integração

A integração com o Pagar.me permite:
- **Pagamentos PIX**: QR code com countdown, polling automático, cópia e cola
- **Pagamentos Cartão**: Tokenização segura no frontend, parcelamento
- **Webhook**: Atualização automática de status
- **Polling**: Verificação de status em tempo real
- **Múltiplos ambientes**: Sandbox e produção
- **Gerenciamento centralizado**: Tokens armazenados no banco de dados

### Ambientes Suportados
- **Sandbox**: `https://api.pagar.me/core/v5`
- **Produção**: `https://api.pagar.me/core/v5`

---

## Estrutura de Arquivos

```
pedidos/
├── lib/
│   ├── pagarme.ts                    # Lógica principal de integração
│   ├── integrations.ts               # Gerenciamento de tokens no BD
│   ├── integrations-types.ts         # Tipos TypeScript
│   └── database.ts                   # Conexão PostgreSQL
│
├── app/api/
│   ├── payment/
│   │   ├── create/route.ts           # Endpoint de criação de transação
│   │   ├── webhook/route.ts          # Webhook handler
│   │   └── status/route.ts          # Polling de status
│   └── pagarme/
│       └── public-key/route.ts       # Endpoint para public key
│
├── components/checkout/
│   └── PaymentForm.tsx               # Componente de pagamento
│
└── database/
    └── schema.sql                     # Schema do banco (tabela payments, integration_tokens)
```

---

## Autenticação e Gerenciamento de Tokens

### Tokens Necessários

A integração utiliza dois tipos de tokens:

1. **Secret Key** (`secret_key`): Usado no backend para criar transações
   - Armazenado em `integration_tokens.token_value`
   - Usado em HTTP Basic Auth: `Basic ${Buffer.from(secret_key + ':').toString('base64')}`

2. **Public Key** (`public_key`): Usado no frontend para tokenização de cartão
   - Armazenado em `integration_tokens.additional_data.public_key`
   - Fallback para variáveis de ambiente: `PAGARME_PUBLIC_KEY` ou `PAGARME_PUBLIC_KEY_SANDBOX`

### Gerenciamento de Tokens

Os tokens são gerenciados via tabela `integration_tokens`:

```sql
CREATE TABLE integration_tokens (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    environment VARCHAR(20) NOT NULL,
    token_value TEXT NOT NULL,
    token_type VARCHAR(20) DEFAULT 'api_key',
    additional_data JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, environment)
);
```

### Configuração de Tokens

1. Acesse `/admin/integrations`
2. Selecione Pagar.me
3. Configure tokens para sandbox e/ou produção:
   - **Token**: Secret Key do Pagar.me
   - **Public Key**: Public Key do Pagar.me (em `additional_data`)

### Obtenção de Tokens

```typescript
// Backend: Obter secret_key
const apiKey = await getApiKey(environment)

// Frontend: Obter public_key
const response = await fetch(`/api/pagarme/public-key?environment=${environment}`)
const { publicKey } = await response.json()
```

---

## Criação de Transações

### Endpoint

`POST /api/payment/create`

### Parâmetros

```typescript
{
  order_id: number
  payment_method: 'pix' | 'credit_card'
  environment?: 'sandbox' | 'production'
  customer: {
    name: string
    email: string
    document: string // CPF (11 dígitos)
    phone: {
      country_code: string // '55' para Brasil
      area_code: string    // DDD (2 dígitos)
      number: string       // 8 ou 9 dígitos
    }
  }
  billing?: {
    name: string
    address: {
      street: string
      number: string
      complement?: string
      neighborhood: string
      city: string
      state: string      // UF (2 letras)
      zip_code: string   // CEP (8 dígitos)
    }
  }
  credit_card?: {
    card_token: string   // Token gerado no frontend
    installments?: number // Número de parcelas (padrão: 1)
  }
}
```

### Validações

- **Cliente**: Nome (mín. 3 caracteres), email válido, CPF (11 dígitos)
- **Telefone**: Código do país 55, DDD 2 dígitos, número 8-9 dígitos
- **Pedido**: Deve estar com status `aguardando_pagamento`
- **Cartão**: `card_token` obrigatório para pagamento com cartão

### Resposta

```typescript
{
  success: true
  transaction: {
    id: string              // ID da transação Pagar.me
    status: string          // 'pending' | 'paid' | 'failed'
    payment_method: string
    pix_qr_code?: string    // QR code PIX (se método for PIX)
    pix_expiration_date?: string
  }
}
```

---

## Fluxo PIX

### 1. Criação da Transação

```typescript
// Frontend: PaymentForm.tsx
const response = await fetch('/api/payment/create', {
  method: 'POST',
  body: JSON.stringify({
    order_id,
    payment_method: 'pix',
    customer: customerData,
  }),
})
```

### 2. Processamento Backend

```typescript
// lib/pagarme.ts - createPixTransaction()
const transaction = await createPixTransaction({
  amount: order.total * 100, // em centavos
  payment_method: 'pix',
  customer: customerData,
  items: orderItems,
  metadata: { order_id: order_id.toString() },
}, environment)
```

### 3. Estrutura da Requisição Pagar.me

```json
{
  "items": [...],
  "customer": {
    "name": "...",
    "email": "...",
    "document": "...",
    "phones": {
      "mobile_phone": {
        "country_code": "55",
        "area_code": "18",
        "number": "997264861"
      }
    }
  },
  "payments": [{
    "payment_method": "pix",
    "pix": {
      "expires_in": 3600
    }
  }],
  "metadata": {
    "order_id": "123"
  }
}
```

### 4. Resposta e Extração do QR Code

O sistema busca o QR code em múltiplos campos da resposta:

- `data.charges[0].last_transaction.qr_code`
- `data.charges[0].last_transaction.qr_code_string`
- `data.charges[0].last_transaction.pix_qr_code`
- `data.last_transaction.qr_code`
- `data.qr_code`

### 5. Exibição no Frontend

- **QR Code**: Exibido via `api.qrserver.com` ou placeholder em sandbox
- **Countdown**: 10 minutos (600 segundos) com persistência em `localStorage`
- **Código PIX**: Texto copiável com botão de cópia
- **Polling**: Verificação automática a cada 5 segundos

### 6. Persistência

Dados salvos em `localStorage`:

```typescript
const storageKey = `pix_countdown_${orderId}_${transactionId}`
localStorage.setItem(storageKey, JSON.stringify({
  transactionId,
  expiresAt: Date.now() + 600000, // 10 minutos
  pix_qr_code,
  pix_expiration_date,
}))
```

---

## Fluxo Cartão de Crédito

### 1. Tokenização no Frontend

```typescript
// PaymentForm.tsx
const tokenUrl = `https://api.pagar.me/core/v5/tokens?appId=${publicKey}`
const tokenResponse = await fetch(tokenUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'card',
    card: {
      number: cardNumber,
      holder_name: cardData.card_holder_name,
      exp_month: expMonth,
      exp_year: expYear,
      cvv: cardData.card_cvv,
    },
  }),
})
const { id: cardToken } = await tokenResponse.json()
```

### 2. Criação da Transação

```typescript
const response = await fetch('/api/payment/create', {
  method: 'POST',
  body: JSON.stringify({
    order_id,
    payment_method: 'credit_card',
    credit_card: {
      card_token,
      installments: 1,
    },
    customer: customerData,
  }),
})
```

### 3. Processamento Backend

```typescript
// lib/pagarme.ts - createCreditCardTransaction()
const transaction = await createCreditCardTransaction({
  amount: order.total * 100,
  payment_method: 'credit_card',
  credit_card: {
    card_token,
    installments: 1,
  },
  customer: customerData,
  billing: billingData,
  items: orderItems,
  metadata: { order_id: order_id.toString() },
}, environment)
```

### 4. Estrutura da Requisição Pagar.me

```json
{
  "items": [...],
  "customer": {...},
  "payments": [{
    "payment_method": "credit_card",
    "credit_card": {
      "installments": 1,
      "statement_descriptor": "PEDIDO",
      "card_token": "...",
      "card": {
        "billing_address": {...}
      }
    }
  }],
  "metadata": {...}
}
```

### 5. Resposta

```typescript
{
  id: string
  status: 'paid' | 'pending' | 'failed'
  charges: [{
    last_transaction: {
      status: string
      acquirer_response_code?: string
      acquirer_response_message?: string
    }
  }]
}
```

---

## Webhooks

### Endpoint

`POST /api/payment/webhook`

### Configuração no Pagar.me

1. Acesse o dashboard Pagar.me
2. Configure webhook: `https://seudominio.com/api/payment/webhook`
3. Eventos: `order.paid`, `order.payment_failed`, `order.pending`

### Processamento

```typescript
// app/api/payment/webhook/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json()
  const event = body.type || body.event
  const data = body.data || body
  
  // Buscar order_id no metadata
  const orderId = data.metadata?.order_id || data.order?.metadata?.order_id
  
  // Atualizar status do pagamento
  await query(
    `UPDATE payments SET status = $1, paid_at = $2 WHERE pagarme_transaction_id = $3`,
    [paymentStatus, paidAt, transactionId]
  )
  
  // Se pago, atualizar pedido
  if (paymentStatus === 'paid') {
    await query(
      `UPDATE orders SET status = 'aguardando_producao', paid_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [orderId]
    )
  }
}
```

### Status Mapeados

- `paid` / `captured` → `paid`
- `refused` / `failed` → `failed`
- `pending` → `pending`

---

## Polling de Status

### Endpoint

`GET /api/payment/status?transaction_id={id}&environment={env}`

### Implementação Frontend

```typescript
// PaymentForm.tsx
const checkPaymentStatus = useCallback(async () => {
  const response = await fetch(
    `/api/payment/status?transaction_id=${pixTransactionId}&environment=${environment}`
  )
  const { status } = await response.json()
  
  if (status === 'paid') {
    setPaymentStatus('paid')
    onSuccess()
  } else if (status === 'failed') {
    setPaymentStatus('failed')
  }
}, [pixTransactionId, environment])

// Polling a cada 5 segundos
useEffect(() => {
  const interval = setInterval(checkPaymentStatus, 5000)
  return () => clearInterval(interval)
}, [checkPaymentStatus])
```

### Detecção de Ambiente

```typescript
function detectEnvironment(request: NextRequest): 'sandbox' | 'production' {
  if (process.env.NODE_ENV === 'development') return 'sandbox'
  
  const hostname = request.headers.get('host') || ''
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    return 'sandbox'
  }
  
  if (process.env.PAGARME_ENVIRONMENT === 'sandbox') return 'sandbox'
  return 'production'
}
```

---

## Estrutura do Banco de Dados

### Tabela: payments

```sql
CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    pagarme_transaction_id VARCHAR(255) NOT NULL,
    method VARCHAR(20) NOT NULL, -- 'pix' | 'credit_card'
    installments INTEGER DEFAULT 1,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'pending' | 'paid' | 'failed'
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tabela: integration_tokens

```sql
CREATE TABLE integration_tokens (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL, -- 'pagarme'
    environment VARCHAR(20) NOT NULL, -- 'sandbox' | 'production'
    token_value TEXT NOT NULL, -- secret_key
    token_type VARCHAR(20) DEFAULT 'api_key',
    additional_data JSONB, -- { public_key: "..." }
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, environment)
);
```

---

## Tratamento de Erros

### Erros Comuns

1. **Token não configurado**
   - Erro: `Token do Pagar.me não configurado para ambiente {environment}`
   - Solução: Configurar token em `/admin/integrations`

2. **Public Key não encontrada**
   - Erro: `Public key do Pagar.me não configurada`
   - Solução: Adicionar `public_key` em `additional_data` do token

3. **Transação falhou**
   - Erro: `Transação PIX falhou: {mensagem}`
   - Verificar: `gateway_response.errors` na resposta

4. **QR Code não gerado**
   - Erro: `QR Code não foi gerado pelo Pagar.me`
   - Verificar: Token válido, PIX habilitado na conta

5. **Company não encontrada**
   - Erro: `Conta Pagar.me não configurada corretamente`
   - Solução: Verificar configuração da Company no Pagar.me

### Logs de Desenvolvimento

Em `NODE_ENV=development`, logs detalhados são exibidos:

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('[Pagar.me PIX] Usando API key:', {
    environment,
    keyPreview: maskedKey,
  })
  console.log('[Pagar.me PIX] Request body completo:', requestBody)
  console.error('[Pagar.me PIX] Erro na API:', { status, errorMessage })
}
```

---

## Interface do Usuário

### Componente PaymentForm

Localização: `components/checkout/PaymentForm.tsx`

**Funcionalidades:**

1. **Seleção de Método**
   - Radio buttons para PIX e Cartão
   - Ícones visuais (QrCode, CreditCard)

2. **PIX**
   - Exibição de QR code (ou placeholder em sandbox)
   - Countdown regressivo (10 minutos)
   - Código PIX copiável
   - Polling automático de status
   - Feedback visual (pending, paid, failed, expired)

3. **Cartão**
   - Formulário de dados do cartão
   - Validação em tempo real
   - Tokenização automática
   - Feedback de loading e erro

### Estados Visuais

- **Pending**: Ícone Clock, mensagem "Aguardando pagamento..."
- **Paid**: Ícone CheckCircle2 verde, mensagem de sucesso
- **Failed**: Ícone XCircle vermelho, mensagem de erro, botão "Fale Conosco"
- **Expired**: Ícone AlertCircle, mensagem de expiração

### Persistência

- Dados do PIX salvos em `localStorage`
- Recuperação automática ao recarregar página
- Limpeza automática após expiração ou pagamento

---

## Fluxos Completos

### Fluxo PIX Completo

```
Cliente seleciona PIX
    ↓
Frontend: POST /api/payment/create
    ↓
Backend: createPixTransaction()
    ↓
Pagar.me: Cria transação e retorna QR code
    ↓
Frontend: Exibe QR code e inicia countdown
    ↓
Frontend: Salva em localStorage
    ↓
Frontend: Polling a cada 5s
    ↓
Backend: GET /api/payment/status
    ↓
Pagar.me: Retorna status atualizado
    ↓
Frontend: Detecta pagamento → onSuccess()
    ↓
Webhook: Pagar.me notifica pagamento
    ↓
Backend: Atualiza pedido para 'aguardando_producao'
```

### Fluxo Cartão Completo

```
Cliente preenche dados do cartão
    ↓
Frontend: Tokeniza cartão via Pagar.me JS
    ↓
Frontend: POST /api/payment/create com card_token
    ↓
Backend: createCreditCardTransaction()
    ↓
Pagar.me: Processa pagamento
    ↓
Backend: Retorna status (paid/pending/failed)
    ↓
Frontend: Exibe resultado
    ↓
Webhook: Pagar.me notifica status final
    ↓
Backend: Atualiza pedido se necessário
```

---

## Configuração e Variáveis de Ambiente

### Variáveis Opcionais

```env
# Ambiente Pagar.me (opcional, detectado automaticamente)
PAGARME_ENVIRONMENT=sandbox

# Public Keys (fallback se não estiver no banco)
PAGARME_PUBLIC_KEY=sk_test_...
PAGARME_PUBLIC_KEY_SANDBOX=sk_test_...

# Webhook Secret (opcional)
PAGARME_WEBHOOK_SECRET=seu_secret_aqui
```

### Detecção Automática de Ambiente

- `NODE_ENV=development` → sandbox
- Hostname contém `localhost` → sandbox
- Hostname contém IP privado → sandbox
- Caso contrário → production

---

## Segurança

- Tokens **nunca** expostos no frontend (apenas public_key)
- Secret keys armazenadas no banco de dados
- Tokens mascarados em logs (apenas preview)
- Validação de assinatura de webhook (se configurada)
- Autenticação JWT obrigatória para endpoints administrativos

---

## Resumo da Arquitetura

### Componentes Principais

1. **lib/pagarme.ts**: Lógica de integração com Pagar.me
2. **app/api/payment/create/route.ts**: Endpoint de criação
3. **app/api/payment/webhook/route.ts**: Handler de webhook
4. **app/api/payment/status/route.ts**: Polling de status
5. **components/checkout/PaymentForm.tsx**: Interface de pagamento

### Fluxo de Dados

```
Frontend → API Route → lib/pagarme.ts → Pagar.me API
                ↓
         Banco de Dados (payments)
                ↓
         Webhook → Atualização automática
```

---

## Referências

- [Documentação Pagar.me](https://docs.pagar.me/)
- [API Reference v5](https://docs.pagar.me/reference)
- [Guia de Integração PIX](https://docs.pagar.me/docs/realizando-uma-transacao-pix)
- [Guia de Integração Cartão](https://docs.pagar.me/docs/realizando-uma-transacao-de-cartao-de-credito)
