# Gerenciador de Pedidos

Sistema completo de gerenciamento de pedidos desenvolvido com Next.js 14 (App Router), React, Tailwind CSS e PostgreSQL.

## Tecnologias

### Frontend
- **Framework**: Next.js 14.2.0 (App Router)
- **Biblioteca**: React 18.2.0
- **Linguagem**: TypeScript 5.2.2
- **Estilização**: Tailwind CSS 3.4.17
- **Componentes UI**: shadcn/ui (baseado em Radix UI)
- **Ícones**: Lucide React
- **Notificações**: Sonner (toasts)
- **Formatação**: date-fns, class-variance-authority

### Backend
- **Runtime**: Node.js (via Next.js)
- **API**: Next.js Route Handlers (App Router)
- **Autenticação**: JWT (jsonwebtoken 9.0.2)
- **Banco de Dados**: PostgreSQL (via pg 8.11.0)
- **Criptografia**: bcryptjs 2.4.3

### Integrações
- **Pagar.me**: Pagamentos PIX e cartão de crédito
- **Melhor Envio**: Cálculo de fretes em tempo real

## Padrões Visuais

### Design System
O sistema utiliza **shadcn/ui** como base de componentes, garantindo:
- Componentes acessíveis via Radix UI
- Suporte a tema claro/escuro
- Cores primárias: HSL(331, 100%, 50%) - rosa/magenta
- Variantes configuráveis via class-variance-authority

### Componentes Disponíveis
- **Button**: Variantes (default, destructive, outline, secondary, ghost, link, whatsapp)
- **Card**: Container para conteúdo agrupado
- **Dialog**: Modais e diálogos
- **Input**: Campos de formulário
- **Select**: Seletores dropdown
- **Table**: Tabelas de dados
- **Tabs**: Navegação por abas
- **Badge**: Etiquetas e status
- **Popover**: Tooltips e menus
- **Calendar**: Seleção de datas

### Notificações
Sistema de toasts via Sonner com ícones e cores por tipo:
- **Sucesso**: Verde com CheckCircle
- **Erro**: Vermelho com XCircle
- **Aviso**: Amarelo com AlertTriangle
- **Info**: Azul com Info

## Estrutura do Projeto

```
pedidos/
├── app/
│   ├── api/              # Route Handlers (API)
│   │   ├── auth/         # Autenticação
│   │   ├── payment/      # Pagamentos (Pagar.me)
│   │   ├── checkout/     # Checkout público
│   │   ├── integrations/ # Gerenciamento de integrações
│   │   └── shipping/      # Cálculo de fretes
│   ├── admin/            # Páginas administrativas
│   │   ├── dashboard/    # Dashboard com métricas
│   │   ├── orders/       # Gestão de pedidos
│   │   ├── clients/      # Gestão de clientes
│   │   ├── products/    # Gestão de produtos
│   │   ├── integrations/ # Configuração de integrações
│   │   └── shipping/     # Configuração de fretes
│   ├── checkout/         # Checkout público
│   ├── login/            # Página de login
│   └── layout.tsx        # Layout raiz
├── components/
│   ├── ui/               # Componentes base (shadcn/ui)
│   ├── checkout/         # Componentes de checkout
│   ├── orders/           # Componentes de pedidos
│   ├── integrations/     # Componentes de integrações
│   └── shipping/         # Componentes de frete
├── lib/
│   ├── pagarme.ts        # Integração Pagar.me
│   ├── melhor-envio.ts   # Integração Melhor Envio
│   ├── integrations.ts   # Gerenciamento de tokens
│   ├── database.ts       # Conexão PostgreSQL
│   ├── auth.ts           # Autenticação JWT
│   └── utils.ts          # Utilitários gerais
├── database/
│   ├── schema.sql        # Schema do banco
│   ├── seed.sql          # Dados iniciais
│   └── migrations/       # Migrações
└── package.json
```

## Instalação

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Criar arquivo `.env.local` na raiz do projeto:

```env
# Banco de Dados
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pedidos_db
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_SSL=false

# Autenticação
JWT_SECRET=seu-secret-key-aqui-mude-em-producao

# Ambiente
NODE_ENV=development
```

### 3. Inicializar banco de dados

Execute o schema SQL no seu PostgreSQL:

```bash
psql -U seu_usuario -d pedidos_db -f database/schema.sql
```

Execute o seed para criar produtos iniciais:

```bash
psql -U seu_usuario -d pedidos_db -f database/seed.sql
```

### 4. Criar admin inicial

Execute um script Node.js para criar o admin:

```javascript
const bcrypt = require('bcryptjs');
const hash = await bcrypt.hash('admin123', 10);
// Use este hash no INSERT abaixo
```

```sql
INSERT INTO admins (email, password_hash, name)
VALUES ('admin@pedidos.com', '$2a$10$SEU_HASH_AQUI', 'Administrador');
```

### 5. Iniciar servidor de desenvolvimento

```bash
npm run dev
```

O servidor estará disponível em `http://localhost:3000`

## Credenciais Padrão

Após criar o admin:

- **Email**: admin@pedidos.com
- **Senha**: admin123 (ou a que você configurou)

## Funcionalidades Implementadas

### Autenticação
- Login/logout administrativo
- Proteção de rotas com JWT
- Sessão persistente via httpOnly cookies

### Gestão de Clientes
- CRUD completo de clientes
- Múltiplos endereços por cliente
- Validação de CPF único
- Integração WhatsApp 1-clique
- Busca de CEP automática

### Gestão de Produtos
- CRUD de produtos
- Preços base configuráveis
- Dimensões e peso para cálculo de frete

### Gestão de Pedidos
- Criação de pedidos step-by-step
- Edição de itens (título, valor, observações)
- Listagem com filtros avançados
- Alteração de status
- Geração de links de pagamento

### Dashboard
- Métricas em tempo real (total pedidos, faturamento, aguardando pagamento)
- Distribuição por status
- Filtros por período

### Checkout Público
- Fluxo step-by-step (Revisão → Pagamento → Concluído)
- Suporte a múltiplos métodos de pagamento
- Integração com Pagar.me

### Pagamentos
- **PIX**: QR code com countdown, polling automático, cópia e cola
- **Cartão de Crédito**: Tokenização segura, parcelamento
- Webhook para atualização de status
- Polling de status em tempo real

### Fretes
- Integração Melhor Envio
- Cálculo de frete em tempo real
- Cache inteligente de cotações
- Suporte a múltiplos transportadoras

### Integrações
- Gerenciamento centralizado de tokens
- Suporte a múltiplos ambientes (sandbox/produção)
- Validação automática de tokens
- Renovação automática OAuth2 (Melhor Envio)

## Integrações

### Pagar.me
Integração completa para pagamentos PIX e cartão de crédito.

**Documentação**: [INTEGRACAO_PAGARME.md](./INTEGRACAO_PAGARME.md)

**Recursos:**
- Criação de transações PIX e cartão
- Webhook para atualização de status
- Polling de status em tempo real
- Gerenciamento de tokens (secret_key, public_key)
- Suporte a sandbox e produção

### Melhor Envio
Integração para cálculo de fretes em tempo real.

**Documentação**: [INTEGRACAO_MELHOR_ENVIO.md](./INTEGRACAO_MELHOR_ENVIO.md)

**Recursos:**
- Cálculo de frete em tempo real
- Autenticação OAuth2 com renovação automática
- Cache inteligente de cotações
- Suporte a múltiplos transportadoras

## Scripts Disponíveis

- `npm run dev` - Inicia servidor de desenvolvimento
- `npm run build` - Build para produção
- `npm run start` - Inicia servidor de produção
- `npm run lint` - Executa linter

## Arquitetura

O projeto utiliza uma arquitetura monolítica Next.js, onde:

- **Frontend e Backend** estão no mesmo projeto Next.js
- **APIs** são implementadas como Route Handlers em `app/api/`
- **Banco de dados** é acessado via `lib/database.ts` (SQL direto, sem ORM)
- **Autenticação** é gerenciada via JWT em cookies httpOnly
- **Componentes** reutilizáveis em `components/`
- **Integrações** centralizadas em `lib/` com gerenciamento de tokens no banco

## Funcionalidades Pendentes

- Integração Bling ERP
- Regras de frete customizadas
- Parcelamento avançado
- Job de pedidos não pagos
- Relatórios avançados
- Exportação de dados
