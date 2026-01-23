# Script de Teste - Integração Melhor Envio Sandbox

Este script valida a integração com o Melhor Envio no ambiente sandbox, testando todos os aspectos críticos da integração.

## Pré-requisitos

- `curl` instalado
- Credenciais OAuth2 do Melhor Envio (Client ID e Client Secret) para o ambiente sandbox
- Acesso à área de desenvolvedor do Melhor Envio sandbox: https://app-sandbox.melhorenvio.com.br/integracoes/area-dev

## Uso

```bash
./scripts/test-melhor-envio-sandbox.sh <CLIENT_ID> <CLIENT_SECRET>
```

### Exemplo

```bash
./scripts/test-melhor-envio-sandbox.sh abc123def456 xyz789uvw012
```

## O que o script testa

1. **OAuth2 Token (client_credentials)**
   - Obtém token via `POST /oauth/token` com `grant_type=client_credentials`
   - Valida que o endpoint usado é do sandbox: `https://sandbox.melhorenvio.com.br/oauth/token`
   - Verifica se `access_token` e `refresh_token` (se disponível) são retornados

2. **GET /shipment/services**
   - Testa se o token tem permissões de leitura
   - Valida que o endpoint usado é do sandbox: `https://sandbox.melhorenvio.com.br/api/v2/me/shipment/services`
   - Verifica se a lista de serviços é retornada

3. **POST /shipment/calculate**
   - Testa se o token tem permissões de escrita/cálculo
   - Valida que o endpoint usado é do sandbox: `https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate`
   - Verifica se opções de frete são retornadas
   - Diagnostica erros 401 específicos (token inválido, ambiente errado, falta de escopo)

4. **Refresh Token**
   - Testa renovação de token via `grant_type=refresh_token`
   - Valida que o endpoint usado é do sandbox
   - Verifica se novo `access_token` é retornado

5. **Isolamento de Ambiente**
   - Valida que token de sandbox NÃO funciona em produção
   - Confirma que tokens de ambientes diferentes são isolados

## Saída Esperada

```
=== Teste de Integração Melhor Envio - Sandbox ===

Ambiente: sandbox
Client ID: abc123def4...

[1/6] Obtendo token OAuth2 via client_credentials (sandbox)...
✓ Token obtido com sucesso
  Access Token: eyJhbGciOiJIUzI1NiIs...
  Expires In: 2592000s
  Refresh Token: def456ghi789... (ou não fornecido)

[2/6] Testando GET /shipment/services (sandbox)...
✓ Serviços listados com sucesso
  Serviços encontrados: 5

[3/6] Testando POST /shipment/calculate (sandbox)...
✓ Cálculo de frete realizado com sucesso
  Opções de frete encontradas: 3

[4/6] Testando refresh token (sandbox)...
✓ Token renovado com sucesso
  Novo Access Token: xyz789abc123...

[5/6] Validando isolamento de ambiente...
✓ Isolamento de ambiente confirmado
  Token de sandbox corretamente rejeitado em produção

=== Resumo dos Testes ===
Passou: 5/5
Falhou: 0/5
✓ Todos os testes passaram!
```

## Tratamento de Erros

### Erro 401 ao obter token
- Verifique se Client ID e Client Secret estão corretos
- Confirme que as credenciais são do ambiente sandbox
- Verifique se o app está ativo no painel do Melhor Envio

### Erro 401 ao listar serviços
- Token pode estar inválido/expirado
- Token pode ser de ambiente diferente
- Verifique se o token foi gerado corretamente

### Erro 401 ao calcular frete
- Token pode não ter escopo/permissão para calcular
- Use o fluxo `authorization_code` com scopes (`shipping-calculate`, `shipping-read`)
- Reautorize o app na página de Integrações

### Token de sandbox funciona em produção
- Isso indica problema no isolamento de ambientes
- Verifique se os endpoints estão corretos
- Confirme que está usando tokens do ambiente correto

## Notas Importantes

1. **Scopes**: Tokens obtidos via `client_credentials` podem não ter todas as permissões. Para permissões completas, use o fluxo `authorization_code` com scopes.

2. **Ambientes**: Tokens de sandbox NÃO funcionam em produção e vice-versa. Sempre use tokens do ambiente correto.

3. **Refresh Token**: Nem todos os grant types retornam `refresh_token`. Se não disponível, use `client_credentials` novamente para renovar.

4. **Validação**: Este script valida apenas o ambiente sandbox. Para testar produção, modifique a variável `ENVIRONMENT` no script.

## Integração com o Sistema

Este script valida os mesmos cenários que o sistema implementa:

- ✅ Endpoints OAuth2 por ambiente
- ✅ Validação de tokens (GET e POST)
- ✅ Renovação automática de tokens
- ✅ Diagnóstico de erros 401
- ✅ Isolamento de ambientes

Use este script para validar a integração antes de fazer deploy ou após mudanças na configuração.
