# Gerenciador de Pedidos

Sistema completo de gerenciamento de pedidos desenvolvido com Next.js 14 (App Router), React, Tailwind CSS e PostgreSQL.

## Estrutura do Projeto

```
pedidos/
├── app/
│   ├── api/          # Route Handlers (API)
│   ├── admin/       # Páginas administrativas
│   ├── checkout/    # Checkout público
│   ├── login/       # Página de login
│   └── layout.tsx   # Layout raiz
├── components/       # Componentes React
├── lib/             # Utilitários (database, auth, api)
├── database/        # Schemas e seeds SQL
└── package.json
```

## Tecnologias

- **Framework**: Next.js 14 (App Router)
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js Route Handlers (API Routes)
- **Banco de Dados**: PostgreSQL
- **Autenticação**: JWT com httpOnly cookies

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
# Via psql
psql -U seu_usuario -d pedidos_db -f database/schema.sql

# Ou via pgAdmin
# Abra o arquivo database/schema.sql e execute no pgAdmin
```

Execute o seed para criar produtos iniciais:

```bash
psql -U seu_usuario -d pedidos_db -f database/seed.sql
```

### 4. Criar admin inicial

Execute um script Node.js para criar o admin (ou use o mesmo do CRM):

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

## Funcionalidades Implementadas (MVP 1)

### Autenticação
- Login/logout administrativo
- Proteção de rotas

### Gestão de Clientes
- CRUD completo de clientes
- Múltiplos endereços por cliente
- Validação de CPF único
- Botão WhatsApp 1-clique

### Gestão de Produtos
- CRUD de produtos
- Preços base configuráveis

### Gestão de Pedidos
- Criação de pedidos
- Edição de itens (título, valor, observações)
- Listagem com filtros
- Alteração de status

### Dashboard
- Métricas básicas (total pedidos, faturamento, aguardando pagamento)
- Distribuição por status
- Filtros por período

## Funcionalidades Pendentes

- Checkout step-by-step
- Integração Pagar.me
- Integração Melhor Envio
- Integração Bling ERP
- Regras de frete
- Parcelamento
- Job de pedidos não pagos
- Relatórios

## Scripts Disponíveis

- `npm run dev` - Inicia servidor de desenvolvimento
- `npm run build` - Build para produção
- `npm run start` - Inicia servidor de produção
- `npm run lint` - Executa linter

## Arquitetura

O projeto utiliza uma arquitetura monolítica Next.js, onde:

- **Frontend e Backend** estão no mesmo projeto Next.js
- **APIs** são implementadas como Route Handlers em `app/api/`
- **Banco de dados** é acessado via `lib/database.ts`
- **Autenticação** é gerenciada via JWT em cookies httpOnly
- **Componentes** reutilizáveis em `components/`
 
 