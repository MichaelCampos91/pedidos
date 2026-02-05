# Integração Melhor Envio

Documentação completa da integração com Melhor Envio para cálculo de frete e gestão de modalidades de envio.

## Visão Geral

A integração com Melhor Envio permite calcular automaticamente o valor do frete para pedidos, oferecendo múltiplas opções de transporte aos clientes. O sistema:

- **Calcula frete** em tempo real baseado no CEP de destino
- **Oferece múltiplas modalidades** de envio (PAC, Sedex, Jadlog, etc.)
- **Aplica regras customizadas** de desconto e valor mínimo
- **Sincroniza modalidades** disponíveis da plataforma
- **Suporta ambientes** sandbox e produção separadamente

## Autenticação

### OAuth2 com Authorization Code Flow

A integração utiliza OAuth2 seguindo o padrão authorization code flow, que é o método recomendado para ter todas as permissões necessárias:

1. **Configuração Inicial**: É necessário ter um Client ID configurado no app do Melhor Envio
2. **Geração de URL de Autorização**: Sistema gera URL para o usuário autorizar o app
3. **Redirecionamento**: Usuário é redirecionado para o Melhor Envio e autoriza o acesso
4. **Callback**: Melhor Envio redireciona de volta com um código de autorização
5. **Troca por Token**: Sistema troca o código por access_token e refresh_token
6. **Armazenamento**: Tokens são salvos no banco de dados de forma segura

### Método Alternativo: Client Credentials

Também é possível usar `grant_type=client_credentials`, mas este método pode não ter todas as permissões necessárias (especialmente para POST requests). O método authorization_code é recomendado.

**Importante**: As permissões do app são configuradas no painel do desenvolvedor do Melhor Envio, não via scopes na URL de autorização.

## Versão da API

O sistema utiliza a **Melhor Envio API v2**:

- **URL Base Sandbox**: `https://sandbox.melhorenvio.com.br/api/v2/me`
- **URL Base Produção**: `https://melhorenvio.com.br/api/v2/me`
- **Documentação Oficial**: https://melhorenvio.com.br/api/

### Ambientes Separados

O Melhor Envio possui ambientes completamente separados:

- **Sandbox**: Para testes e desenvolvimento
- **Produção**: Para uso real com clientes

**CRÍTICO**: Tokens de sandbox não funcionam em produção e vice-versa. Sempre use o ambiente correto.

## Endpoints Utilizados

### Cálculo de Frete

**POST** `/shipment/calculate`

Calcula o valor do frete para um pedido baseado no CEP de origem, CEP de destino, dimensões e peso dos produtos.

**Payload Exemplo**:
```json
{
  "from": {
    "postal_code": "16010000"
  },
  "to": {
    "postal_code": "01310100"
  },
  "products": [
    {
      "id": "123",
      "width": 20,
      "height": 10,
      "length": 30,
      "weight": 0.5,
      "insurance_value": 100.00,
      "quantity": 1
    }
  ],
  "services": "1,2,3,4"
}
```

**Resposta**:
```json
[
  {
    "id": 1,
    "name": "PAC",
    "price": 15.50,
    "currency": "BRL",
    "delivery_time": 10,
    "delivery_range": {
      "min": 8,
      "max": 12
    }
  },
  {
    "id": 2,
    "name": "Sedex",
    "price": 25.00,
    "currency": "BRL",
    "delivery_time": 5,
    "delivery_range": {
      "min": 3,
      "max": 7
    }
  }
]
```

**Parâmetros**:
- `from.postal_code`: CEP de origem (configurável via variável `MELHOR_ENVIO_CEP_ORIGEM`)
- `to.postal_code`: CEP de destino (fornecido pelo cliente)
- `products`: Array com dimensões e peso de cada produto
- `services`: IDs das modalidades a calcular (opcional, se não informado calcula todas)

### Listagem de Modalidades

**GET** `/shipment/services`

Lista todas as modalidades de envio disponíveis na conta do Melhor Envio.

**Resposta**:
```json
[
  {
    "id": 1,
    "name": "PAC",
    "company": {
      "id": 1,
      "name": "Correios"
    },
    "type": "normal"
  },
  {
    "id": 2,
    "name": "Sedex",
    "company": {
      "id": 1,
      "name": "Correios"
    },
    "type": "express"
  }
]
```

## Fluxos Principais

### 1. Autorização OAuth2

**Passo a Passo**:

1. Usuário acessa a página de Integrações
2. Configura Client ID na integração Melhor Envio
3. Clica em "Autorizar App no Melhor Envio"
4. Sistema gera URL de autorização com:
   - Client ID
   - Redirect URI (configurado no app Melhor Envio)
   - State (ambiente: sandbox ou production)
5. Usuário é redirecionado para o Melhor Envio
6. Usuário autoriza o app no Melhor Envio
7. Melhor Envio redireciona para `/api/auth/callback/melhor-envio` com código
8. Sistema troca código por tokens
9. Tokens são salvos no banco de dados

**Arquivos Envolvidos**:
- `app/api/integrations/melhor-envio/authorize/route.ts`: Gera URL de autorização
- `app/api/auth/callback/melhor-envio/route.ts`: Processa callback e salva tokens
- `lib/melhor-envio-oauth.ts`: Funções de renovação de tokens

### 2. Cálculo de Frete

Quando um cliente informa o CEP de destino durante o checkout:

1. **Coleta de Dados**: Sistema coleta:
   - CEP de destino
   - Dimensões e peso de cada produto do pedido
   - Valor total do pedido (para regras)
2. **Preparação de Payload**: Monta requisição no formato Melhor Envio
3. **Aplicação de Regras**: Antes de calcular, aplica regras customizadas:
   - Verifica valor mínimo para frete grátis
   - Aplica descontos configurados
   - Filtra modalidades ativas
4. **Chamada à API**: Envia requisição para Melhor Envio
5. **Processamento de Resposta**: Para cada opção retornada:
   - Aplica descontos configurados
   - Verifica se atende valor mínimo
   - Filtra apenas modalidades ativas
6. **Retorno ao Cliente**: Exibe opções de frete com valores finais

**Arquivos Envolvidos**:
- `app/api/shipping/quote/route.ts`: Endpoint principal de cálculo
- `lib/melhor-envio.ts`: Função `calculateShipping()`
- `lib/shipping-rules.ts`: Aplicação de regras customizadas
- `lib/shipping-utils.ts`: Utilitários para formatação

**Regras Aplicadas**:
- **Frete Grátis**: Se valor do pedido >= valor mínimo configurado
- **Desconto**: Percentual ou valor fixo configurado por modalidade
- **Modalidades Ativas**: Apenas modalidades marcadas como ativas são exibidas
- **Valor Mínimo**: Modalidades com valor abaixo do mínimo são filtradas

### 3. Sincronização de Modalidades

Permite sincronizar as modalidades disponíveis na conta do Melhor Envio:

1. **Início**: Usuário clica em "Sincronizar Modalidades"
2. **Busca**: Sistema busca todas as modalidades via API
3. **Processamento**: Para cada modalidade:
   - Verifica se já existe no banco
   - Se não existe, cria novo registro
   - Se existe, atualiza nome e informações
4. **Ativação**: Mantém estado de ativação (usuário escolhe quais usar)
5. **Finalização**: Exibe mensagem de sucesso

**Arquivos Envolvidos**:
- `app/api/settings/shipping-modalities/sync/route.ts`: Endpoint de sincronização
- `lib/melhor-envio.ts`: Função de busca de modalidades
- Tabela `shipping_modalities`: Armazena modalidades disponíveis

**Campos Armazenados**:
- `melhor_envio_id`: ID da modalidade no Melhor Envio
- `name`: Nome da modalidade (ex: "PAC", "Sedex")
- `company_name`: Nome da transportadora
- `is_active`: Se modalidade está ativa para uso
- `environment`: Ambiente (sandbox ou production)

### 4. Aplicação de Regras de Frete

O sistema permite configurar regras customizadas de frete:

**Tipos de Regras**:

1. **Frete Grátis**: 
   - Condição: Valor do pedido >= valor mínimo
   - Ação: Define frete como R$ 0,00
   
2. **Desconto Percentual**:
   - Condição: Pode ter condições (estado, valor mínimo, etc.)
   - Ação: Aplica desconto percentual no valor do frete
   
3. **Desconto Fixo**:
   - Condição: Pode ter condições
   - Ação: Subtrai valor fixo do frete

**Condições Suportadas**:
- Estado de destino (UF)
- Valor mínimo do pedido
- Valor máximo do pedido
- CEP de destino (faixa)
- Modalidade específica

**Arquivos Envolvidos**:
- `lib/shipping-rules.ts`: Lógica de aplicação de regras
- Tabela `shipping_rules`: Armazena regras configuradas
- `app/api/settings/shipping-rules/route.ts`: CRUD de regras

## Renovação de Tokens

O sistema renova automaticamente os tokens quando necessário:

### Refresh Token

Quando um token está próximo de expirar (menos de 5 minutos), o sistema:

1. Detecta expiração ao tentar usar o token
2. Usa `refresh_token` para obter novo `access_token`
3. Atualiza tokens no banco de dados
4. Retenta a operação original

**Importante**: Tokens obtidos via `client_credentials` podem não ter `refresh_token`. Neste caso, é necessário reautorizar o app.

**Arquivos Envolvidos**:
- `lib/melhor-envio-oauth.ts`: Função `refreshOAuth2Token()`
- `lib/integrations.ts`: Função `getTokenWithFallback()` com auto-refresh

### Validação Periódica

O sistema permite validar tokens manualmente na página de Integrações:

- Testa conexão com API do Melhor Envio
- Verifica se token ainda é válido
- Atualiza status de validação no banco
- Diagnostica problemas específicos (token expirado, ambiente errado, falta de permissão)

## Armazenamento de Tokens

Os tokens são armazenados na tabela `integration_tokens`:

- **provider**: `'melhor_envio'`
- **environment**: `'sandbox'` ou `'production'` (separados)
- **token_value**: Access token atual
- **token_type**: `'bearer'`
- **additional_data**: JSON com:
  - `refresh_token`: Para renovação automática
  - `client_id`: Client ID usado
  - `cep_origem`: CEP de origem configurado
- **expires_at**: Data de expiração do token
- **is_active**: Se token está ativo

**Segurança**:
- Tokens nunca são expostos no frontend
- Apenas o backend acessa tokens completos
- Refresh tokens são armazenados de forma segura
- Tokens de sandbox e produção são completamente separados

## Tratamento de Erros

O sistema trata diversos tipos de erros com diagnósticos específicos:

### Token Inválido ou Expirado (401)

**Diagnóstico Automático**:
- Verifica se token está expirado
- Verifica se ambiente está correto (sandbox vs produção)
- Verifica se token tem permissões necessárias

**Ações**:
- Tenta renovar token automaticamente
- Se falhar, retorna erro específico para usuário reautorizar

### Ambiente Incorreto

**Sintoma**: Token de sandbox usado em produção ou vice-versa

**Solução**: Sistema detecta e sugere usar token do ambiente correto

### Falta de Permissão (403)

**Sintoma**: Token válido mas sem permissão para calcular frete

**Causa**: Token obtido via `client_credentials` pode não ter todas as permissões

**Solução**: Reautorizar usando authorization_code flow

### CEP Inválido

**Sintoma**: Erro ao calcular frete com CEP inválido

**Validação**: Sistema valida CEP antes de enviar (8 dígitos)

**Tratamento**: Retorna erro amigável pedindo CEP válido

### Rate Limiting

**Sintoma**: Erro 429 (Too Many Requests)

**Ação**: Sistema implementa retry com backoff exponencial

**Prevenção**: Cache de cotações por CEP para evitar requisições repetidas

## Cache de Cotações

Para otimizar performance e reduzir chamadas à API, o sistema implementa cache:

- **Chave de Cache**: CEP destino + dimensões dos produtos
- **Tempo de Expiração**: Configurável (padrão: 1 hora)
- **Armazenamento**: Tabela `shipping_cache` ou memória

**Arquivos Envolvidos**:
- `lib/shipping-cache.ts`: Gerenciamento de cache

## Boas Práticas

### Configuração

1. **Use ambiente correto**: Sandbox para testes, produção para uso real
2. **Configure CEP de origem**: Defina CEP correto na variável `MELHOR_ENVIO_CEP_ORIGEM`
3. **Autorize via authorization_code**: Garante todas as permissões
4. **Mantenha tokens atualizados**: Sistema renova automaticamente

### Cálculo de Frete

1. **Valide CEP antes**: Verifique se CEP tem 8 dígitos
2. **Use dimensões reais**: Dimensões incorretas geram valores errados
3. **Configure regras**: Aproveite sistema de regras para descontos
4. **Ative apenas modalidades necessárias**: Evita confusão do cliente

### Regras de Frete

1. **Teste regras**: Use sandbox para testar antes de produção
2. **Ordene por prioridade**: Regras são aplicadas na ordem configurada
3. **Seja específico**: Use condições para aplicar regras corretas
4. **Monitore resultados**: Verifique se regras estão funcionando como esperado

## Troubleshooting

### Token não funciona

**Problema**: Erro 401 ao tentar calcular frete

**Soluções**:
1. Verifique se token está ativo na página de Integrações
2. Tente validar token manualmente
3. Verifique diagnóstico de erro (ambiente, permissão, expiração)
4. Se necessário, reautorize o app no Melhor Envio
5. Verifique se está usando ambiente correto (sandbox vs produção)

### Frete não calcula

**Problema**: Nenhuma opção de frete retornada

**Soluções**:
1. Verifique se CEP está correto (8 dígitos)
2. Verifique se há modalidades ativas configuradas
3. Verifique se produtos têm dimensões e peso
4. Consulte logs do sistema para erros específicos
5. Teste diretamente na API do Melhor Envio

### Regras não aplicam

**Problema**: Regras configuradas não estão funcionando

**Soluções**:
1. Verifique ordem das regras (são aplicadas sequencialmente)
2. Verifique condições das regras (podem estar muito restritivas)
3. Teste regra isoladamente
4. Verifique logs para ver qual regra está sendo aplicada

### Modalidades não sincronizam

**Problema**: Erro ao sincronizar modalidades

**Soluções**:
1. Verifique se token tem permissão para listar serviços
2. Verifique se está usando ambiente correto
3. Tente sincronizar novamente
4. Verifique se app tem permissões corretas no painel do desenvolvedor

### Valores de frete incorretos

**Problema**: Valores calculados não batem com Melhor Envio

**Soluções**:
1. Verifique dimensões e peso dos produtos
2. Verifique CEP de origem configurado
3. Verifique se regras não estão alterando valores incorretamente
4. Compare com cálculo direto na plataforma Melhor Envio

## Referências

- [Documentação Oficial Melhor Envio](https://melhorenvio.com.br/api/)
- [API v2 Reference](https://melhorenvio.com.br/api/v2/)
- [OAuth2 do Melhor Envio](https://melhorenvio.com.br/api/v2/oauth)
