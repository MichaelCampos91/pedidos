# Testes Obrigatórios - Integração Bling API v3

Este documento descreve os cenários de teste obrigatórios para validar o envio de pedidos ao Bling quando o contato já existe.

## Cenários de Teste

### 1. Contato inexistente → cria contato → cria venda OK

**Objetivo**: Validar que quando o contato não existe no Bling, o sistema cria o contato e depois cria a venda com sucesso.

**Passos**:
1. Criar um pedido no sistema com um cliente que **não existe** no Bling (CPF/CNPJ novo).
2. Enviar o pedido ao Bling usando uma das situações de envio (aprovação, botão manual, ou sincronização).
3. Verificar nos logs que o contato foi criado (`created: true`).
4. Verificar que a venda foi criada no Bling com sucesso.
5. Verificar que o status do pedido mudou para "Enviado" (badge verde).

**Resultado esperado**: 
- Contato criado no Bling.
- Venda criada no Bling.
- Status do pedido: "Enviado".
- Logs mostram `strategy: null, created: true`.

---

### 2. Contato existente → encontra por numeroDocumento → cria venda OK

**Objetivo**: Validar que quando o contato existe e é encontrado pela estratégia A (numeroDocumento), a venda é criada com sucesso.

**Passos**:
1. Criar um contato manualmente no Bling com CPF/CNPJ conhecido.
2. Criar um pedido no sistema com o mesmo CPF/CNPJ.
3. Enviar o pedido ao Bling.
4. Verificar nos logs que o contato foi encontrado pela estratégia "documento".
5. Verificar que a venda foi criada no Bling usando o ID do contato existente.

**Resultado esperado**:
- Contato encontrado via `GET /contatos?numeroDocumento=...`.
- Venda criada com `contato: { id: <numero> }`.
- Status do pedido: "Enviado".
- Logs mostram `strategy: 'documento', created: false`.

---

### 3. Contato existente → numeroDocumento falha → pesquisa encontra → cria venda OK

**Objetivo**: Validar que quando o filtro numeroDocumento não funciona, a busca por pesquisa (estratégia B) encontra o contato.

**Passos**:
1. Criar um contato manualmente no Bling com CPF/CNPJ conhecido.
2. Simular que o filtro `?numeroDocumento=` não funciona (ou usar um CPF que não retorna resultado nesse filtro).
3. Criar um pedido no sistema com o mesmo CPF/CNPJ.
4. Enviar o pedido ao Bling.
5. Verificar nos logs que a estratégia A falhou e a estratégia B (pesquisa) encontrou o contato.
6. Verificar que a venda foi criada com sucesso.

**Resultado esperado**:
- Busca por numeroDocumento retorna vazio ou erro.
- Busca por pesquisa encontra o contato.
- Venda criada com sucesso.
- Logs mostram `strategy: 'pesquisa', created: false`.

---

### 4. Contato existente → filtros falham → paginação encontra → cria venda OK

**Objetivo**: Validar que quando as estratégias A e B falham, a paginação (estratégia C) encontra o contato.

**Passos**:
1. Criar um contato manualmente no Bling com CPF/CNPJ conhecido.
2. Simular que os filtros A e B não funcionam (ou usar um CPF que não retorna resultado nesses filtros).
3. Criar um pedido no sistema com o mesmo CPF/CNPJ.
4. Enviar o pedido ao Bling.
5. Verificar nos logs que as estratégias A e B falharam e a estratégia C (paginação) encontrou o contato.
6. Verificar que a venda foi criada com sucesso.

**Resultado esperado**:
- Buscas A e B retornam vazio.
- Busca paginada encontra o contato (pode estar em páginas posteriores).
- Venda criada com sucesso.
- Logs mostram `strategy: 'paginacao', created: false`.
- Logs mostram número de páginas verificadas e contatos checados.

---

### 5. Contato duplicado → tentar criar → erro duplicidade → refazer busca completa → encontra → cria venda OK

**Objetivo**: Validar que quando tentamos criar um contato que já existe, o sistema detecta o erro de duplicidade, refaz a busca completa e encontra o contato.

**Passos**:
1. Criar um contato manualmente no Bling com CPF/CNPJ conhecido.
2. Criar um pedido no sistema com o mesmo CPF/CNPJ.
3. Simular que a busca inicial (A+B+C) não encontra o contato (ou garantir que não encontra).
4. Enviar o pedido ao Bling.
5. Verificar nos logs que:
   - Tentativa de criar contato retornou erro de duplicidade.
   - Sistema refez busca completa (A+B+C).
   - Contato foi encontrado na busca após duplicidade.
6. Verificar que a venda foi criada com sucesso.

**Resultado esperado**:
- POST /contatos retorna erro 400/409/422 com mensagem de duplicidade.
- Sistema refaz busca completa após detectar duplicidade.
- Contato encontrado na busca após duplicidade.
- Venda criada com sucesso.
- Logs mostram `strategy: 'documento'|'pesquisa'|'paginacao', created: false`.
- Logs mostram `refazendoBusca: true` e `attempts` maior que 3.

---

### 6. Contato não encontrado após todas tentativas → falha com erro claro e orientado

**Objetivo**: Validar que quando todas as estratégias falham, o sistema retorna erro claro com orientações.

**Passos**:
1. Criar um pedido no sistema com CPF/CNPJ válido.
2. Garantir que o contato existe no Bling mas não será encontrado por nenhuma estratégia (ex.: CPF formatado diferente, conta Bling diferente, escopos faltando).
3. Tentar enviar o pedido ao Bling.
4. Verificar que o sistema retorna erro claro explicando:
   - Quantas tentativas foram feitas.
   - Quais estratégias foram tentadas.
   - Orientação para verificar escopos.
   - Orientação para reautorizar integração.

**Resultado esperado**:
- Erro retornado com mensagem detalhada.
- Mensagem inclui número de tentativas.
- Mensagem inclui estratégias tentadas.
- Mensagem inclui orientações sobre escopos (ID: 318257565).
- Status do pedido: "Erro" (badge vermelha).
- Erro salvo em `bling_sync_error` e `bling_sync_logs`.

---

## Situações de Envio a Testar

Cada cenário acima deve ser testado nas **três situações de envio**:

### Situação 1: Envio automático após aprovação de pagamento
- **Rota**: `POST /api/orders/[id]/approve-payment`
- **Como testar**: Aprovar pagamento de um pedido manualmente ou via API do Pagar.me.
- **Validação**: Verificar que após aprovação, o pedido é enviado ao Bling automaticamente.

### Situação 2: Botão "Enviar ao Bling" do dropdown de ações
- **Componente**: `app/admin/orders/page.tsx` - botão na coluna de ações.
- **Como testar**: 
  - Na listagem de pedidos, abrir dropdown de ações de um pedido pago.
  - Clicar em "Enviar ao Bling".
  - Verificar badge "Enviando..." durante o processo.
- **Validação**: Verificar que o pedido é enviado e a badge muda para "Enviado" ou "Erro".

### Situação 3: Sincronização em lote da tela de integrações
- **Rota**: `POST /api/bling/sync/orders`
- **Componente**: `components/integrations/BlingSyncCard.tsx`
- **Como testar**:
  - Ir para tela de Integrações.
  - Selecionar data inicial.
  - Clicar em "Sincronizar Pedidos".
- **Validação**: Verificar que todos os pedidos da data são processados e sincronizados.

---

## Checklist de Validação

Para cada teste, verificar:

- [ ] Payload da venda sempre contém `contato: { id: <numero> }` (nunca dados inline).
- [ ] Logs estruturados mostram cada etapa (buscar, criar, refazer busca).
- [ ] Logs não expõem tokens ou dados sensíveis completos.
- [ ] Mensagens de erro são claras e orientadas.
- [ ] Retry funciona apenas para 5xx e 429 (não para 4xx de validação).
- [ ] Paginação para quando lista vazia (não por limite fixo).
- [ ] Badge "Enviando..." aparece durante o envio (situação 2).
- [ ] Status do pedido é atualizado corretamente após envio.

---

## Notas

- Todos os testes devem ser executados no ambiente de produção (ou sandbox se disponível).
- Verificar logs do servidor para detalhes de cada etapa.
- Se algum teste falhar, verificar:
  1. Escopos do app Bling estão corretos.
  2. Token está válido e não expirado.
  3. CPF/CNPJ está no formato correto (apenas dígitos).
  4. Contato existe na conta Bling correta.
