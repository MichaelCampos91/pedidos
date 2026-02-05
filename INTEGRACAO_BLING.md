# Integração Bling

Documentação completa da integração com o Bling ERP para sincronização de pedidos, produtos, categorias e clientes.

## Visão Geral

A integração com Bling permite sincronização bidirecional de dados entre o sistema de pedidos e o ERP Bling. O sistema pode:

- **Enviar pedidos** para o Bling quando são pagos
- **Importar contatos** (clientes) do Bling para o sistema
- **Sincronizar produtos** e categorias com o Bling
- **Rastrear status** de sincronização de cada pedido

## Autenticação

### OAuth2 com Authorization Code Flow

A integração utiliza OAuth2 seguindo o padrão authorization code flow, que é mais seguro que tokens diretos:

1. **Configuração Inicial**: É necessário ter um Client ID e Client Secret do Bling
2. **Geração de URL de Autorização**: Sistema gera URL para o usuário autorizar o app
3. **Redirecionamento**: Usuário é redirecionado para o Bling e autoriza o acesso
4. **Callback**: Bling redireciona de volta com um código de autorização
5. **Troca por Token**: Sistema troca o código por access_token e refresh_token
6. **Armazenamento**: Tokens são salvos no banco de dados de forma segura

### Escopos Necessários

O app Bling precisa ter os seguintes escopos configurados:

- **Pedidos de Venda**: Para criar e consultar pedidos de venda
- **Contatos (criação)**: Para criar contatos no Bling antes de criar pedidos

**Importante**: A API v3 do Bling exige que um contato exista antes de criar um pedido de venda. Por isso, o sistema sempre cria o contato primeiro quando necessário.

## Versão da API

O sistema utiliza a **Bling API v3**:

- **URL Base**: `https://api.bling.com.br/Api/v3`
- **Documentação Oficial**: https://developer.bling.com.br/
- **Referência da API**: https://developer.bling.com.br/referencia

### Diferenças da API v3

A API v3 do Bling introduziu mudanças importantes:

- Requer que contatos existam antes de criar pedidos
- Estrutura de dados diferente da v2
- Melhor tratamento de erros
- Suporte a refresh tokens para renovação automática

## Endpoints Utilizados

### Validação de Token

**GET** `/pedidos/vendas?limite=1`

Valida se o token está funcionando fazendo uma requisição leve. Usa pedidos/vendas em vez de contatos para respeitar os escopos solicitados.

**Resposta de Sucesso**: Status 200 com lista de pedidos (mesmo que vazia)

**Resposta de Erro**: Status 401/403 se token inválido ou expirado

### Criação de Pedidos de Venda

**POST** `/pedidos/vendas`

Cria um novo pedido de venda no Bling. Antes de criar o pedido, o sistema:

1. Verifica se o cliente já existe no Bling (via `bling_contact_id`)
2. Se não existir, cria o contato primeiro
3. Cria o pedido de venda vinculado ao contato

**Payload Exemplo**:
```json
{
  "numero": "12345",
  "data": "2026-02-05",
  "dataSaida": "2026-02-05",
  "cliente": {
    "id": 123456
  },
  "itens": [
    {
      "produto": {
        "id": 789012
      },
      "quantidade": 2,
      "valor": 100.00
    }
  ],
  "valores": {
    "valorFrete": 15.00,
    "valorTotal": 215.00
  }
}
```

### Criação de Contatos

**POST** `/contatos`

Cria um novo contato no Bling. Usado quando o cliente não existe no Bling antes de criar um pedido.

**Payload Exemplo**:
```json
{
  "nome": "João Silva",
  "tipo": "F",
  "cpfCnpj": "12345678900",
  "email": "joao@example.com",
  "telefone": "11999999999"
}
```

### Importação de Contatos

**GET** `/contatos`

Lista contatos do Bling para importação em massa. Suporta paginação e filtros.

**Parâmetros**:
- `pagina`: Número da página (padrão: 1)
- `limite`: Quantidade por página (padrão: 100)
- `situacao`: Filtrar por situação (ex: "A" para ativos)

## Fluxos Principais

### 1. Autorização OAuth2

**Passo a Passo**:

1. Usuário acessa a página de Integrações
2. Clica em "Autorizar App no Bling"
3. Sistema gera URL de autorização com:
   - Client ID
   - Redirect URI (configurado no app Bling)
   - Escopos necessários
   - State (ambiente: sandbox ou production)
4. Usuário é redirecionado para o Bling
5. Usuário autoriza o app no Bling
6. Bling redireciona para `/api/auth/callback/bling` com código
7. Sistema troca código por tokens
8. Tokens são salvos no banco de dados

**Arquivos Envolvidos**:
- `app/api/integrations/bling/authorize/route.ts`: Gera URL de autorização
- `app/api/auth/callback/bling/route.ts`: Processa callback e salva tokens
- `lib/bling-oauth.ts`: Funções de renovação de tokens

### 2. Sincronização de Pedidos

Quando um pedido é pago, o sistema automaticamente tenta sincronizá-lo com o Bling:

1. **Verificação de Status**: Verifica se pedido já foi sincronizado
2. **Busca de Cliente**: Verifica se cliente existe no Bling
3. **Criação de Contato**: Se necessário, cria contato no Bling
4. **Preparação de Dados**: Monta payload do pedido no formato Bling
5. **Envio**: Envia pedido para API do Bling
6. **Registro de Log**: Salva resultado em `bling_sync_logs`
7. **Atualização de Status**: Marca pedido como sincronizado

**Arquivos Envolvidos**:
- `lib/bling.ts`: Função `sendOrderToBling()` e `syncOrderToBling()`
- `app/api/bling/sync-order/route.ts`: Endpoint para sincronização manual
- `app/api/payment/webhook/route.ts`: Chama sincronização após pagamento

**Status de Sincronização**:
- `pending`: Aguardando sincronização
- `synced`: Sincronizado com sucesso
- `error`: Erro na sincronização (mensagem salva em `bling_sync_error`)

### 3. Importação de Contatos

Permite importar clientes do Bling para o sistema:

1. **Início**: Usuário inicia importação na página de Integrações
2. **Criação de Job**: Sistema cria registro em `bling_contact_import_jobs`
3. **Busca Paginada**: Busca contatos do Bling página por página
4. **Processamento**: Para cada contato:
   - Verifica se já existe (por CPF/CNPJ ou `bling_contact_id`)
   - Se não existe, cria novo cliente
   - Se existe, atualiza dados
   - Salva `bling_contact_id` para referência futura
5. **Atualização de Progresso**: Atualiza contadores a cada 5 contatos
6. **Finalização**: Marca job como concluído ou com erro

**Arquivos Envolvidos**:
- `app/api/bling/contacts/import/route.ts`: Endpoint de importação
- `app/api/bling/contacts/import/status/route.ts`: Consulta status do job
- `lib/bling.ts`: Funções de busca e criação de contatos

**Campos Importados**:
- Nome completo
- CPF ou CNPJ
- Email
- Telefone e WhatsApp
- Endereços (múltiplos endereços por cliente)

### 4. Sincronização de Produtos e Categorias

Sincroniza produtos e categorias do sistema para o Bling:

1. **Sincronização de Categorias**: Cria categorias no Bling se não existirem
2. **Sincronização de Produtos**: Cria ou atualiza produtos no Bling
3. **Vinculação**: Associa produtos às categorias corretas
4. **Registro**: Atualiza `bling_sync_status` com última data de sincronização

**Arquivos Envolvidos**:
- `app/api/bling/sync/categories/route.ts`: Sincronização de categorias
- `app/api/bling/sync/products/route.ts`: Sincronização de produtos
- `lib/bling.ts`: Funções `syncCategoriesToBling()` e `syncProductsToBling()`

## Renovação de Tokens

O sistema renova automaticamente os tokens quando necessário:

### Refresh Token

Quando um token está próximo de expirar (menos de 5 minutos), o sistema:

1. Detecta expiração ao tentar usar o token
2. Usa `refresh_token` para obter novo `access_token`
3. Atualiza tokens no banco de dados
4. Retenta a operação original

**Arquivos Envolvidos**:
- `lib/bling-oauth.ts`: Função `refreshBlingOAuth2Token()`
- `lib/integrations.ts`: Função `getTokenWithFallback()` com auto-refresh

### Validação Periódica

O sistema permite validar tokens manualmente na página de Integrações:

- Testa conexão com API do Bling
- Verifica se token ainda é válido
- Atualiza status de validação no banco

## Armazenamento de Tokens

Os tokens são armazenados na tabela `integration_tokens`:

- **provider**: `'bling'`
- **environment**: `'sandbox'` ou `'production'`
- **token_value**: Access token atual
- **token_type**: `'bearer'`
- **additional_data**: JSON com:
  - `refresh_token`: Para renovação automática
  - `client_id`: Client ID usado
  - `client_secret`: Client Secret usado (criptografado)
- **expires_at**: Data de expiração do token
- **is_active**: Se token está ativo

**Segurança**:
- Tokens nunca são expostos no frontend
- Apenas o backend acessa tokens completos
- Refresh tokens são armazenados de forma segura

## Tratamento de Erros

O sistema trata diversos tipos de erros:

### Token Inválido ou Expirado

- **Sintoma**: Erro 401 ou 403 na API
- **Ação**: Tenta renovar token automaticamente
- **Se falhar**: Retorna erro para usuário reautorizar

### Cliente Não Encontrado

- **Sintoma**: Erro ao criar pedido dizendo que contato não existe
- **Ação**: Sistema cria contato automaticamente antes de criar pedido
- **Prevenção**: Sistema sempre verifica existência antes de criar pedido

### Erros de Validação

- **Sintoma**: Erro 400 com mensagem de validação
- **Ação**: Loga erro detalhado e retorna mensagem amigável
- **Registro**: Erro salvo em `bling_sync_error` do pedido

### Rate Limiting

- **Sintoma**: Erro 429 (Too Many Requests)
- **Ação**: Sistema implementa retry com backoff exponencial
- **Prevenção**: Limita requisições por segundo

## Logs e Rastreabilidade

Todas as operações são registradas:

### Logs de Sincronização

Tabela `bling_sync_logs`:
- `order_id`: Pedido sincronizado
- `status`: `'success'` ou `'error'`
- `error_message`: Mensagem de erro (se houver)
- `response_data`: Resposta completa da API (JSON)
- `created_at`: Data/hora da sincronização

### Status de Sincronização

Tabela `bling_sync_status`:
- `entity_type`: Tipo (`'categories'`, `'products'`, `'contacts'`, `'orders'`)
- `last_synced_at`: Última sincronização bem-sucedida

### Jobs de Importação

Tabela `bling_contact_import_jobs`:
- `status`: `'running'`, `'completed'` ou `'failed'`
- `total_contacts`: Total a processar
- `processed_contacts`: Processados até agora
- `imported_count`: Novos criados
- `updated_count`: Atualizados
- `skipped_count`: Ignorados

## Boas Práticas

### Configuração

1. **Sempre use produção em ambiente real**: Sandbox é apenas para testes
2. **Mantenha tokens atualizados**: Sistema renova automaticamente, mas verifique periodicamente
3. **Configure escopos corretos**: App Bling precisa ter permissões necessárias

### Sincronização

1. **Não sincronize pedidos duplicados**: Sistema verifica `bling_sync_status` antes
2. **Aguarde pagamento**: Só sincronize pedidos pagos
3. **Verifique logs**: Em caso de erro, consulte `bling_sync_logs`

### Importação

1. **Importe contatos antes de criar pedidos**: Facilita sincronização futura
2. **Revise dados importados**: Verifique se CPF/CNPJ estão corretos
3. **Evite importações duplicadas**: Sistema detecta duplicatas, mas é bom verificar

## Troubleshooting

### Token não funciona

**Problema**: Erro 401 ao tentar usar API

**Soluções**:
1. Verifique se token está ativo na página de Integrações
2. Tente validar token manualmente
3. Se falhar, reautorize o app no Bling
4. Verifique se Client ID e Secret estão corretos

### Pedido não sincroniza

**Problema**: Pedido pago mas não aparece no Bling

**Soluções**:
1. Verifique status em `bling_sync_status` do pedido
2. Consulte logs em `bling_sync_logs`
3. Tente sincronizar manualmente via botão na página do pedido
4. Verifique se cliente existe no Bling (ou se foi criado corretamente)

### Erro ao criar contato

**Problema**: Erro ao criar contato antes de pedido

**Soluções**:
1. Verifique se CPF/CNPJ está no formato correto
2. Verifique se contato já existe no Bling
3. Consulte mensagem de erro em `bling_sync_error`
4. Verifique se app tem escopo de criação de contatos

### Importação muito lenta

**Problema**: Importação de contatos demora muito

**Soluções**:
1. Normal para grandes volumes (processa em lotes)
2. Acompanhe progresso via página de status
3. Não interrompa processo (pode causar inconsistências)
4. Considere importar em horários de menor uso

## Referências

- [Documentação Oficial Bling](https://developer.bling.com.br/)
- [Referência da API v3](https://developer.bling.com.br/referencia)
- [OAuth2 do Bling](https://developer.bling.com.br/referencia#section/Autenticacao)
