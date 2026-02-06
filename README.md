# Gerenciador de Pedidos

Sistema completo de gestão de pedidos online com integrações para processamento de pagamentos, cálculo de frete e sincronização com sistemas ERP.

## Visão Geral

Este sistema permite que empresas gerenciem pedidos de forma centralizada, desde a criação até o envio, incluindo:

- **Gestão de Pedidos**: Criação, acompanhamento e atualização de status de pedidos
- **Cadastro de Clientes**: Armazenamento de informações de clientes com múltiplos endereços
- **Catálogo de Produtos**: Gerenciamento de produtos e categorias
- **Processamento de Pagamentos**: Integração com Pagar.me para pagamentos via PIX e cartão de crédito
- **Cálculo de Frete**: Integração com Melhor Envio para cálculo automático de frete
- **Sincronização ERP**: Integração com Bling para sincronização de pedidos, produtos e clientes

## Stack Tecnológica

### Frontend
- **Next.js 14**: Framework React com App Router para rotas e páginas
- **React 18**: Biblioteca para construção de interfaces
- **TypeScript**: Linguagem de programação com tipagem estática
- **Tailwind CSS**: Framework CSS para estilização
- **Radix UI**: Componentes de interface acessíveis e customizáveis
- **Lucide React**: Biblioteca de ícones

### Backend
- **Next.js API Routes**: Rotas de API integradas ao Next.js
- **Node.js**: Ambiente de execução JavaScript
- **PostgreSQL**: Banco de dados relacional
- **bcryptjs**: Biblioteca para hash de senhas
- **jsonwebtoken**: Biblioteca para geração e validação de tokens JWT

### Autenticação
- **JWT (JSON Web Tokens)**: Tokens de autenticação armazenados em cookies HTTP-only
- **Cookies**: Armazenamento seguro de tokens no navegador

## Estrutura do Projeto

```
pedidos/
├── app/                    # Rotas e páginas (Next.js App Router)
│   ├── admin/             # Área administrativa
│   │   ├── dashboard/      # Dashboard com métricas
│   │   ├── orders/        # Gestão de pedidos
│   │   ├── clients/        # Gestão de clientes
│   │   ├── products/      # Gestão de produtos
│   │   ├── integrations/  # Configuração de integrações
│   │   ├── settings/      # Configurações do sistema
│   │   └── shipping/      # Configuração de frete
│   ├── api/               # Rotas de API
│   │   ├── auth/          # Autenticação
│   │   ├── orders/        # Endpoints de pedidos
│   │   ├── clients/        # Endpoints de clientes
│   │   ├── products/      # Endpoints de produtos
│   │   ├── payment/       # Processamento de pagamentos
│   │   ├── shipping/      # Cálculo de frete
│   │   ├── bling/         # Integração Bling
│   │   └── integrations/  # Gestão de tokens de integração
│   ├── checkout/          # Página de checkout
│   └── login/             # Página de login
├── components/            # Componentes React reutilizáveis
│   ├── ui/                # Componentes de interface base
│   ├── orders/            # Componentes relacionados a pedidos
│   ├── checkout/          # Componentes de checkout
│   ├── integrations/      # Componentes de integrações
│   └── settings/          # Componentes de configurações
├── lib/                   # Bibliotecas e utilitários
│   ├── api.ts             # Cliente API para requisições do frontend
│   ├── auth.ts            # Funções de autenticação
│   ├── auth-context.tsx   # Contexto React para autenticação
│   ├── database.ts        # Conexão com banco de dados
│   ├── bling.ts           # Cliente da API Bling
│   ├── melhor-envio.ts    # Cliente da API Melhor Envio
│   ├── pagarme.ts         # Cliente da API Pagar.me
│   ├── integrations.ts    # Gestão de tokens de integração
│   └── utils.ts           # Funções utilitárias
├── database/              # Arquivos relacionados ao banco de dados
│   ├── schema.sql         # Schema completo do banco
│   └── seed_*.sql         # Scripts de seed para dados iniciais
└── public/                # Arquivos estáticos
```

## Principais Funcionalidades

### Dashboard
Página inicial do sistema que exibe métricas e estatísticas importantes:
- Total de pedidos e faturamento
- Pedidos aguardando pagamento
- Ticket médio
- Distribuição por status, forma de pagamento e estado
- Top produtos mais vendidos
- Filtros por período de data

### Gestão de Pedidos
Permite criar, visualizar e gerenciar pedidos:
- Criação de novos pedidos com seleção de cliente e produtos
- Visualização detalhada de cada pedido
- Atualização de status (aguardando pagamento, em produção, enviado, etc.)
- Geração de links de pagamento
- Aprovação manual de pagamentos
- Cancelamento de pedidos
- Sincronização automática com Bling quando o pedido é pago

### Gestão de Clientes
Sistema completo de cadastro de clientes:
- Cadastro de clientes pessoa física (CPF) ou jurídica (CNPJ)
- Múltiplos endereços por cliente
- Endereço padrão para entregas
- Importação em massa de clientes do Bling
- Histórico de pedidos por cliente

### Catálogo de Produtos
Gerenciamento de produtos e categorias:
- Cadastro de produtos com nome, descrição, preço e dimensões
- Organização por categorias
- Sincronização de produtos e categorias com Bling
- Controle de estoque (quando aplicável)

### Integrações
Página centralizada para configuração de todas as integrações:
- **Bling**: Configuração de OAuth2 e sincronização
- **Melhor Envio**: Configuração de tokens OAuth2
- **Pagar.me**: Configuração de API keys e public keys
- Validação de tokens e credenciais
- Seleção de ambiente (sandbox/produção) por integração
- Histórico de validações

### Configurações
Configurações avançadas do sistema:
- **Regras de Frete**: Descontos, valores mínimos e condições especiais
- **Taxas de Parcelamento**: Configuração de juros por quantidade de parcelas
- **Modalidades de Envio**: Sincronização e ativação de modalidades do Melhor Envio
- **Configurações de Pagamento**: Desconto PIX, configurações gerais

### Checkout
Página pública para finalização de pedidos:
- Seleção de método de pagamento (PIX ou cartão)
- Cálculo automático de frete
- Aplicação de descontos e regras
- Processamento seguro de pagamentos
- Geração de QR Code PIX
- Tokenização segura de cartão de crédito

## Banco de Dados

O sistema utiliza PostgreSQL como banco de dados. As principais tabelas são:

### Tabelas Principais

- **admins**: Usuários administrativos do sistema
- **clients**: Cadastro de clientes
- **client_addresses**: Endereços dos clientes
- **products**: Catálogo de produtos
- **product_categories**: Categorias de produtos
- **orders**: Pedidos do sistema
- **order_items**: Itens de cada pedido
- **payments**: Registro de pagamentos
- **integration_tokens**: Tokens de autenticação das integrações
- **shipping_rules**: Regras customizadas de frete
- **shipping_modalities**: Modalidades de envio disponíveis
- **installment_rates**: Taxas de parcelamento
- **bling_sync_logs**: Logs de sincronização com Bling
- **system_logs**: Logs gerais do sistema

### Relacionamentos

- Um cliente pode ter múltiplos endereços
- Um pedido pertence a um cliente e tem um endereço de entrega
- Um pedido contém múltiplos itens (produtos)
- Um pedido pode ter múltiplos pagamentos (tentativas)
- Produtos pertencem a categorias
- Clientes podem estar vinculados a contatos do Bling

## Autenticação

O sistema utiliza autenticação baseada em JWT (JSON Web Tokens):

1. **Login**: Usuário informa email e senha
2. **Validação**: Sistema verifica credenciais no banco de dados
3. **Geração de Token**: Se válido, gera token JWT
4. **Armazenamento**: Token é armazenado em cookie HTTP-only
5. **Proteção de Rotas**: Rotas administrativas verificam token antes de permitir acesso
6. **Logout**: Remove cookie e invalida sessão

### Segurança

- Senhas são armazenadas com hash bcrypt (nunca em texto plano)
- Tokens JWT têm tempo de expiração
- Cookies são HTTP-only (não acessíveis via JavaScript)
- Rotas de API verificam autenticação antes de processar requisições

## Divisão de Responsabilidades

### Frontend (`/app` e `/components`)
- Interface do usuário e experiência visual
- Formulários e validações básicas
- Chamadas para APIs do backend
- Gerenciamento de estado da interface
- Proteção de rotas no lado do cliente

### Backend (`/app/api`)
- Processamento de requisições
- Validação de dados e regras de negócio
- Comunicação com banco de dados
- Integração com APIs externas (Bling, Melhor Envio, Pagar.me)
- Autenticação e autorização
- Processamento de webhooks

### Bibliotecas (`/lib`)
- Clientes de API externas
- Funções utilitárias reutilizáveis
- Lógica de negócio compartilhada
- Helpers para formatação e cálculos

### Banco de Dados (`/database`)
- Schema completo do banco
- Scripts de migração (quando aplicável)
- Seeds para dados iniciais

## Como Começar

### Pré-requisitos

- Node.js 18 ou superior
- PostgreSQL 12 ou superior
- Contas nas plataformas integradas (Bling, Melhor Envio, Pagar.me)

### Instalação

1. Clone o repositório
2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente (crie um arquivo `.env.local`):
   ```
   DATABASE_URL=sua_url_de_conexao_postgresql
   JWT_SECRET=seu_secret_jwt
   ```

4. Execute o schema do banco de dados:
   ```bash
   psql -d seu_banco < database/schema.sql
   ```

5. Execute os seeds (opcional):
   ```bash
   psql -d seu_banco < database/seed_admins.sql
   ```

6. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

7. Acesse `http://localhost:3000` e faça login

### Configuração de Integrações

Após o primeiro login, configure as integrações na página **Integrações**:

1. **Bling**: Configure Client ID e Client Secret, depois autorize o app
2. **Melhor Envio**: Configure Client ID e autorize o app
3. **Pagar.me**: Configure API Key e Public Key

Consulte a documentação específica de cada integração para mais detalhes:
- [Integração Bling](INTEGRACAO_BLING.md)
- [Integração Melhor Envio](INTEGRACAO_MELHOR_ENVIO.md)
- [Integração Pagar.me](INTEGRACAO_PAGARME.md)

## Fluxo de Trabalho Típico

1. **Cadastro de Produtos**: Crie produtos e categorias no sistema
2. **Cadastro de Clientes**: Cadastre clientes ou importe do Bling
3. **Criação de Pedido**: Crie um pedido selecionando cliente e produtos
4. **Cálculo de Frete**: Sistema calcula frete automaticamente via Melhor Envio
5. **Geração de Link de Pagamento**: Gere link para o cliente pagar
6. **Processamento de Pagamento**: Cliente paga via PIX ou cartão
7. **Atualização Automática**: Sistema atualiza status do pedido via webhook
8. **Sincronização com Bling**: Pedido é automaticamente sincronizado quando pago
9. **Acompanhamento**: Acompanhe o pedido até o envio

## Enviar Pedido ao Bling via Terminal

O sistema inclui um script de teste que permite enviar pedidos ao Bling diretamente pelo terminal, útil para debug e testes.

### Script de Teste

O script `test-bling-order-sync.js` permite testar o envio completo de um pedido ao Bling com logs detalhados de todas as etapas:

1. Busca do pedido no banco de dados
2. Busca/criação do contato no Bling
3. Envio do pedido ao Bling
4. (Opcional) Atualização dos campos no banco de dados

### Uso Básico

```bash
node scripts/test-bling-order-sync.js <ORDER_ID>
```

**Exemplo:**
```bash
node scripts/test-bling-order-sync.js 1
```

Este comando irá:
- Exibir todos os dados do pedido, cliente e itens
- Tentar buscar o contato no Bling pelo CPF/CNPJ
- Se não encontrar, criar o contato no Bling
- Enviar o pedido ao Bling
- Exibir todas as requisições e respostas da API do Bling (sem sanitização)
- Mostrar logs detalhados de cada etapa

### Persistir Dados no Banco (Flag --save)

Por padrão, o script apenas testa o fluxo sem alterar o banco de dados. Para atualizar os campos após um teste bem-sucedido, use a flag `--save`:

```bash
node scripts/test-bling-order-sync.js <ORDER_ID> --save
```

**Exemplo:**
```bash
node scripts/test-bling-order-sync.js 1 --save
```

Quando usado com `--save`, o script irá atualizar:
- `bling_contact_id` no cliente (se diferente do atual)
- `bling_sync_status` = 'synced'
- `bling_sync_error` = NULL
- `bling_sale_numero` = número usado no envio

### Requisitos

- Variáveis de ambiente do banco de dados configuradas (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)
- Token do Bling configurado e ativo no banco de dados
- Pedido deve ter endereço de entrega cadastrado
- Cliente deve ter CPF ou CNPJ válido

### Exemplo de Saída

```
================================================================================
[2026-02-06T11:29:30.498Z] 1: Buscando pedido no banco de dados
================================================================================

--- Dados do Pedido ---
{
  "id": "1",
  "client_id": "4",
  "total": "1149.70",
  ...
}

================================================================================
[2026-02-06T11:29:32.138Z] 3: Buscando contato no Bling por documento: 079***
================================================================================

GET https://api.bling.com.br/Api/v3/contatos?numeroDocumento=07980983920
Status: 200 OK

✅ Contato encontrado: ID 17943806992

================================================================================
[2026-02-06T11:29:32.488Z] 5: Enviando pedido ao Bling
================================================================================

POST https://api.bling.com.br/Api/v3/pedidos/vendas
Status: 201 Created

✅ Pedido enviado com sucesso! ID Bling: 25021087270

================================================================================
[2026-02-06T11:29:33.224Z] FINAL: Processo concluído com sucesso!
================================================================================

Resumo:
- Pedido ID: 1
- Contato Bling ID: 17943806992
- Pedido Bling ID: 25021087270
- Número Bling: PED-20260206-FECEBC
```

### Troubleshooting

- **Erro de conexão com banco**: Verifique as variáveis de ambiente DB_*
- **Token não encontrado**: Configure o token do Bling na página de Integrações
- **Pedido sem endereço**: Adicione um endereço de entrega ao pedido antes de enviar
- **Cliente sem CPF/CNPJ**: O cliente deve ter CPF ou CNPJ válido para criar contato no Bling

## Logs e Auditoria

O sistema mantém logs de todas as operações importantes:
- Tentativas de login
- Criação e alteração de pedidos
- Processamento de pagamentos
- Sincronizações com Bling
- Erros e avisos do sistema

Os logs podem ser visualizados na página **Logs** do painel administrativo.

## Suporte e Documentação

Para mais informações sobre integrações específicas, consulte:
- [Integração Bling](INTEGRACAO_BLING.md)
- [Integração Melhor Envio](INTEGRACAO_MELHOR_ENVIO.md)
- [Integração Pagar.me](INTEGRACAO_PAGARME.md)
