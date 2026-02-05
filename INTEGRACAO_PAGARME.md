# Integração Pagar.me

Documentação completa da integração com Pagar.me para processamento de pagamentos via PIX e cartão de crédito.

## Visão Geral

A integração com Pagar.me permite processar pagamentos de forma segura, oferecendo múltiplas formas de pagamento aos clientes. O sistema suporta:

- **PIX**: Pagamento instantâneo com QR Code e desconto configurável
- **Cartão de Crédito**: Pagamento parcelado com taxas de juros configuráveis
- **Webhooks**: Atualização automática de status de pagamentos
- **Tokenização**: Segurança na captura de dados de cartão
- **Ambientes separados**: Sandbox para testes e produção para uso real

## Autenticação

### API Key (Bearer Token)

Diferente das outras integrações, o Pagar.me utiliza autenticação via API Key:

1. **Configuração**: É necessário ter uma API Key (secret key) do Pagar.me
2. **Armazenamento**: API Key é salva no banco de dados de forma segura
3. **Uso**: API Key é enviada no header `Authorization: Bearer {api_key}` em todas as requisições
4. **Public Key**: Chave pública separada para tokenização no frontend

### Chaves Necessárias

- **API Key (Secret Key)**: Usada no backend para criar transações e consultar status
- **Public Key**: Usada no frontend para tokenizar dados de cartão (não expõe dados sensíveis)

**Importante**: A Public Key pode ser exposta no frontend, mas a API Key (secret) nunca deve ser exposta.

## Versão da API

O sistema utiliza a **Pagar.me Core API v5**:

- **URL Base**: `https://api.pagar.me/core/v5`
- **Documentação Oficial**: https://docs.pagar.me/
- **Referência da API**: https://docs.pagar.me/reference

### Ambientes

O Pagar.me utiliza a mesma URL para sandbox e produção, diferenciando apenas pelas credenciais:

- **Sandbox**: Usa API Key e Public Key de sandbox
- **Produção**: Usa API Key e Public Key de produção

**CRÍTICO**: Sempre use as credenciais corretas para cada ambiente. Credenciais de sandbox não funcionam em produção e vice-versa.

## Endpoints Utilizados

### Tokenização de Cartão (Frontend)

**POST** `/tokens?appId={public_key}`

Tokeniza dados do cartão de crédito no frontend antes de enviar para o backend. Isso garante que dados sensíveis nunca passem pelo servidor da aplicação.

**Payload**:
```json
{
  "type": "card",
  "card": {
    "number": "4111111111111111",
    "holder_name": "João Silva",
    "exp_month": 12,
    "exp_year": 2025,
    "cvv": "123"
  }
}
```

**Resposta**:
```json
{
  "id": "card_token_abc123",
  "type": "card"
}
```

**Uso**: O token retornado é enviado ao backend, que usa para criar a transação sem nunca ver os dados reais do cartão.

### Criação de Transação PIX

**POST** `/orders`

Cria uma transação PIX e retorna QR Code para pagamento.

**Payload Exemplo**:
```json
{
  "items": [
    {
      "amount": 10000,
      "description": "Pedido #123",
      "quantity": 1,
      "code": "prod-456"
    }
  ],
  "customer": {
    "name": "João Silva",
    "email": "joao@example.com",
    "document": "12345678900",
    "type": "individual",
    "phones": {
      "mobile_phone": {
        "country_code": "55",
        "area_code": "11",
        "number": "999999999"
      }
    }
  },
  "payments": [
    {
      "payment_method": "pix",
      "pix": {
        "expires_in": 3600
      }
    }
  ],
  "metadata": {
    "order_id": "123"
  }
}
```

**Resposta**:
```json
{
  "id": "order_abc123",
  "status": "pending",
  "charges": [
    {
      "id": "ch_xyz789",
      "status": "pending",
      "payment_method": "pix",
      "last_transaction": {
        "id": "tran_123",
        "status": "pending",
        "qr_code": "00020126330014BR.GOV.BCB.PIX...",
        "qr_code_url": "https://pagar.me/qr/..."
      }
    }
  ]
}
```

### Criação de Transação Cartão de Crédito

**POST** `/orders`

Cria uma transação com cartão de crédito usando token gerado no frontend.

**Payload Exemplo**:
```json
{
  "items": [
    {
      "amount": 10000,
      "description": "Pedido #123",
      "quantity": 1,
      "code": "prod-456"
    }
  ],
  "customer": {
    "name": "João Silva",
    "email": "joao@example.com",
    "document": "12345678900",
    "type": "individual",
    "phones": {
      "mobile_phone": {
        "country_code": "55",
        "area_code": "11",
        "number": "999999999"
      }
    }
  },
  "payments": [
    {
      "payment_method": "credit_card",
      "credit_card": {
        "token": "card_token_abc123",
        "installments": 3,
        "statement_descriptor": "LOJA EXEMPLO"
      }
    }
  ],
  "metadata": {
    "order_id": "123"
  }
}
```

**Resposta**:
```json
{
  "id": "order_abc123",
  "status": "paid",
  "charges": [
    {
      "id": "ch_xyz789",
      "status": "paid",
      "payment_method": "credit_card",
      "last_transaction": {
        "id": "tran_123",
        "status": "paid",
        "amount": 10000
      }
    }
  ]
}
```

### Consulta de Status

**GET** `/orders/{order_id}`

Consulta o status atual de uma transação.

**Resposta**:
```json
{
  "id": "order_abc123",
  "status": "paid",
  "charges": [...]
}
```

### Webhook

**POST** `/api/payment/webhook`

Endpoint que recebe notificações do Pagar.me sobre mudanças de status de pagamentos.

**Payload do Webhook**:
```json
{
  "id": "hook_123",
  "type": "order.paid",
  "data": {
    "id": "order_abc123",
    "status": "paid"
  }
}
```

## Fluxos Principais

### 1. Configuração de Credenciais

**Passo a Passo**:

1. Usuário acessa página de Integrações
2. Seleciona integração Pagar.me
3. Configura API Key (secret key) para ambiente desejado
4. Configura Public Key para tokenização no frontend
5. Sistema valida credenciais fazendo requisição de teste
6. Credenciais são salvas no banco de dados

**Arquivos Envolvidos**:
- `app/api/integrations/tokens/route.ts`: Salva tokens no banco
- `app/api/integrations/validate/pagarme/route.ts`: Valida credenciais
- `app/api/pagarme/public-key/route.ts`: Retorna public key para frontend

### 2. Processamento de Pagamento PIX

Quando cliente escolhe pagar via PIX:

1. **Seleção de Método**: Cliente seleciona PIX no checkout
2. **Criação de Pedido**: Sistema cria pedido com status "aguardando_pagamento"
3. **Criação de Transação**: Backend cria transação PIX no Pagar.me
4. **Aplicação de Desconto**: Se configurado, aplica desconto PIX
5. **Geração de QR Code**: Pagar.me retorna QR Code e URL
6. **Exibição ao Cliente**: Sistema exibe QR Code e instruções
7. **Aguardando Pagamento**: Cliente escaneia e paga
8. **Webhook**: Pagar.me notifica quando pagamento é confirmado
9. **Atualização Automática**: Sistema atualiza status do pedido para "pago"
10. **Sincronização**: Se configurado, sincroniza pedido com Bling

**Arquivos Envolvidos**:
- `app/api/payment/create/route.ts`: Cria transação
- `lib/pagarme.ts`: Função `createPixTransaction()`
- `app/api/payment/webhook/route.ts`: Processa notificações
- `components/checkout/PaymentForm.tsx`: Interface do checkout

**Desconto PIX**:
- Configurável nas configurações do sistema
- Pode ser percentual ou valor fixo
- Aplicado automaticamente no cálculo do valor

### 3. Processamento de Pagamento Cartão de Crédito

Quando cliente escolhe pagar com cartão:

1. **Seleção de Método**: Cliente seleciona cartão de crédito
2. **Preenchimento de Dados**: Cliente preenche dados do cartão
3. **Tokenização no Frontend**: Dados são tokenizados usando Public Key
4. **Seleção de Parcelas**: Cliente escolhe quantidade de parcelas
5. **Cálculo de Juros**: Sistema calcula valor final com taxas de parcelamento
6. **Criação de Transação**: Backend cria transação com token (não dados reais)
7. **Processamento**: Pagar.me processa pagamento
8. **Resposta Imediata**: Status é retornado imediatamente (aprovado ou recusado)
9. **Atualização**: Sistema atualiza status do pedido
10. **Sincronização**: Se aprovado, sincroniza com Bling

**Arquivos Envolvidos**:
- `components/checkout/PaymentForm.tsx`: Tokenização e formulário
- `app/api/payment/create/route.ts`: Cria transação
- `lib/pagarme.ts`: Função `createCreditCardTransaction()`
- `lib/payment-rules.ts`: Cálculo de taxas de parcelamento

**Tokenização**:
- Dados do cartão nunca passam pelo servidor da aplicação
- Token é gerado diretamente no navegador usando Public Key
- Token é enviado ao backend para criar transação
- Maior segurança e conformidade com PCI-DSS

### 4. Parcelamento e Taxas de Juros

O sistema permite configurar taxas de juros por quantidade de parcelas:

1. **Configuração**: Administrador configura taxas nas Configurações
2. **Importação**: Pode importar taxas diretamente do Pagar.me
3. **Cálculo**: Ao selecionar parcelas, sistema calcula valor com juros
4. **Exibição**: Cliente vê valor total e valor por parcela
5. **Aplicação**: Taxa é aplicada na criação da transação

**Arquivos Envolvidos**:
- `app/api/settings/installment-rates/route.ts`: CRUD de taxas
- `app/api/settings/installment-rates/import-pagarme/route.ts`: Importação
- `lib/payment-rules.ts`: Cálculo de valores
- Tabela `installment_rates`: Armazena taxas

**Campos de Taxa**:
- `installments`: Quantidade de parcelas (1 a 12)
- `rate_percentage`: Taxa de juros em porcentagem
- `interest_free`: Se pode ser oferecido sem juros
- `environment`: Ambiente (sandbox ou production)

### 5. Webhooks e Atualização Automática

O Pagar.me envia notificações quando status de pagamento muda:

1. **Configuração**: Webhook URL configurado no painel Pagar.me
2. **Notificação**: Pagar.me envia POST para `/api/payment/webhook`
3. **Validação**: Sistema valida assinatura do webhook (se configurado)
4. **Processamento**: Identifica tipo de evento (paid, failed, etc.)
5. **Busca de Pedido**: Busca pedido relacionado via `metadata.order_id`
6. **Atualização**: Atualiza status do pedido e pagamento
7. **Sincronização**: Se pago, pode disparar sincronização com Bling
8. **Log**: Registra evento nos logs do sistema

**Arquivos Envolvidos**:
- `app/api/payment/webhook/route.ts`: Endpoint do webhook
- `lib/bling.ts`: Sincronização com Bling após pagamento

**Eventos Tratados**:
- `order.paid`: Pagamento aprovado
- `order.payment_failed`: Pagamento recusado
- `order.canceled`: Pedido cancelado

## Armazenamento de Credenciais

As credenciais são armazenadas na tabela `integration_tokens`:

- **provider**: `'pagarme'`
- **environment**: `'sandbox'` ou `'production'` (separados)
- **token_value**: API Key (secret key)
- **token_type**: `'bearer'`
- **additional_data**: JSON com:
  - `public_key`: Public Key para tokenização
- **is_active**: Se credenciais estão ativas

**Fallback para Variáveis de Ambiente**:
- `PAGARME_API_KEY`: API Key de produção
- `PAGARME_API_KEY_SANDBOX`: API Key de sandbox
- `PAGARME_PUBLIC_KEY`: Public Key de produção
- `PAGARME_PUBLIC_KEY_SANDBOX`: Public Key de sandbox

**Segurança**:
- API Keys nunca são expostas no frontend
- Apenas Public Key é enviada ao frontend para tokenização
- Credenciais são armazenadas de forma segura no banco
- Credenciais de sandbox e produção são completamente separadas

## Tratamento de Erros

O sistema trata diversos tipos de erros:

### Credenciais Inválidas

**Sintoma**: Erro 401 ao tentar criar transação

**Soluções**:
1. Verifique se API Key está correta
2. Verifique se está usando ambiente correto
3. Tente validar credenciais na página de Integrações
4. Verifique se credenciais não expiraram

### Cartão Recusado

**Sintoma**: Transação retornada como recusada

**Tratamento**:
- Sistema captura motivo da recusa
- Exibe mensagem amigável ao cliente
- Registra erro nos logs
- Permite tentar novamente com outro cartão

### Dados Inválidos

**Sintoma**: Erro 400 com mensagem de validação

**Validações**:
- CPF/CNPJ no formato correto
- Telefone com código de país e área
- Email válido
- Dados do cartão válidos (tokenização valida antes)

### Webhook Inválido

**Sintoma**: Webhook não processa corretamente

**Validações**:
- Verifica se pedido existe
- Valida formato do payload
- Trata erros graciosamente (não quebra se webhook falhar)

## Segurança

### Tokenização de Cartão

- Dados do cartão nunca passam pelo servidor da aplicação
- Tokenização acontece diretamente no navegador
- Conformidade com PCI-DSS (Payment Card Industry Data Security Standard)
- Tokens são únicos e não podem ser reutilizados

### Validação de Dados

- Validação de CPF/CNPJ antes de enviar
- Validação de email e telefone
- Sanitização de dados antes de enviar à API

### Proteção contra Fraude

- Sistema valida dados antes de processar
- Verifica se pedido não foi já processado
- Previne múltiplas tentativas simultâneas
- Registra todas as tentativas de pagamento

## Boas Práticas

### Configuração

1. **Use ambiente correto**: Sandbox para testes, produção para uso real
2. **Mantenha credenciais seguras**: Nunca exponha API Key no frontend
3. **Configure webhook**: Configure URL de webhook no painel Pagar.me
4. **Valide credenciais**: Teste credenciais antes de usar em produção

### Processamento de Pagamentos

1. **Sempre tokenize cartão**: Nunca envie dados de cartão ao backend
2. **Valide dados antes**: Valide CPF, email, telefone antes de enviar
3. **Trate erros**: Sempre trate erros de forma amigável
4. **Confirme webhook**: Configure webhook para garantir atualização automática

### Taxas de Parcelamento

1. **Configure taxas reais**: Use taxas reais do Pagar.me ou configure manualmente
2. **Importe do Pagar.me**: Use função de importação para facilitar
3. **Teste cálculos**: Verifique se cálculos estão corretos
4. **Informe cliente**: Sempre mostre valor total e por parcela

### Webhooks

1. **Configure corretamente**: URL deve ser acessível publicamente
2. **Valide eventos**: Verifique se eventos estão sendo recebidos
3. **Monitore logs**: Acompanhe processamento de webhooks
4. **Trate falhas**: Implemente retry para webhooks que falharem

## Troubleshooting

### Pagamento não processa

**Problema**: Erro ao tentar processar pagamento

**Soluções**:
1. Verifique se credenciais estão configuradas
2. Verifique se está usando ambiente correto
3. Consulte logs do sistema para erro específico
4. Teste credenciais diretamente na API do Pagar.me
5. Verifique se dados estão no formato correto

### Webhook não funciona

**Problema**: Status não atualiza automaticamente

**Soluções**:
1. Verifique se URL de webhook está configurada no painel Pagar.me
2. Verifique se URL é acessível publicamente
3. Consulte logs para ver se webhooks estão chegando
4. Teste webhook manualmente usando ferramenta do Pagar.me
5. Verifique se endpoint está processando corretamente

### QR Code PIX não aparece

**Problema**: QR Code não é exibido após criar transação PIX

**Soluções**:
1. Verifique se transação foi criada com sucesso
2. Verifique resposta da API (deve conter `qr_code` ou `qr_code_url`)
3. Verifique se frontend está processando resposta corretamente
4. Teste criação de transação diretamente na API

### Cartão sempre recusado

**Problema**: Todos os cartões são recusados

**Soluções**:
1. Verifique se está usando ambiente correto (sandbox vs produção)
2. Use cartões de teste no sandbox (consulte documentação Pagar.me)
3. Verifique se tokenização está funcionando corretamente
4. Consulte motivo da recusa nos logs
5. Teste com cartão diferente

### Taxas de parcelamento incorretas

**Problema**: Valores calculados não batem

**Soluções**:
1. Verifique se taxas estão configuradas corretamente
2. Verifique se está usando taxas do ambiente correto
3. Teste cálculo manualmente
4. Importe taxas do Pagar.me novamente
5. Verifique se cálculo está usando taxas corretas

## Referências

- [Documentação Oficial Pagar.me](https://docs.pagar.me/)
- [API Reference v5](https://docs.pagar.me/reference)
- [Guia de Integração](https://docs.pagar.me/guides)
- [Cartões de Teste](https://docs.pagar.me/guides/testing)
