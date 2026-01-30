# Gerenciador de Pedidos (WhatsApp)

Aplicativo para **gestão de pedidos por WhatsApp de uma única empresa**. O fluxo é receber e aprovar pedidos no sistema (com pagamento via PIX/cartão ou aprovação manual) e, em seguida, **enviar os pedidos aprovados para o Bling**, para que a empresa gerencie **NF-e (notas fiscais eletrônicas)** e **logística** diretamente pelo Bling.

Resumidamente: centralizar pedidos feitos por WhatsApp em um painel próprio e enviar apenas os pedidos já aprovados para o Bling, deixando emissão de NF-e e controle de envios a cargo do Bling.

---

## Principais funcionalidades

- **Gestão de pedidos por WhatsApp** — Pedidos criados/registrados no sistema (cliente, itens, endereço, frete). Aprovação de pagamento (automática por PIX/cartão ou manual). Filtros por período e status; tags e observações.
- **Envio de pedidos aprovados para o Bling** — Integração com a API do Bling para enviar pedidos aprovados; no Bling a empresa emite NF-e e gerencia a logística.
- **Clientes e produtos** — Cadastro de clientes (CPF, contato, endereços) e de produtos (preço, dimensões, peso) para montagem dos pedidos e cotação de frete (Melhor Envio).
- **Pagamentos** — PIX e cartão (Pagar.me) ou aprovação manual; geração de link de pagamento.
- **Frete** — Cotação com Melhor Envio; regras de frete grátis e modalidades ativas configuráveis.
- **Dashboard** — Total de pedidos, faturamento e distribuição por status e forma de pagamento.

---

## Vantagens

1. **Um único ponto para pedidos por WhatsApp** — Tudo em um painel: receber, aprovar e enviar ao Bling só o que foi aprovado.
2. **NF-e e logística no Bling** — Após o envio, a empresa usa o Bling para emitir NF-e e gerenciar envios, sem duplicar processos.
3. **Controle de aprovação** — Apenas pedidos com pagamento confirmado (ou aprovado manualmente) são enviados ao Bling.
4. **Pagamento e frete no mesmo fluxo** — PIX, cartão ou aprovação manual; frete cotado com Melhor Envio antes de fechar o pedido.

---

## Recursos da API Bling previstos para a integração

Para enviar os pedidos aprovados ao Bling e permitir a gestão de NF-e e logística no Bling, o aplicativo pretende utilizar os seguintes recursos da **API Bling v3** (REST, OAuth 2.0, base `https://api.bling.com.br/Api/v3/`):

| Recurso | Uso previsto |
|--------|----------------|
| **Pedidos de venda** | Envio dos pedidos aprovados para o Bling. **POST** `/pedidos/vendas` para criar o pedido de venda no Bling com dados do cliente, itens, valores e endereço de entrega; **GET** para consultar status quando necessário. |
| **Contatos** | Opcional: sincronizar ou buscar contatos (clientes) no Bling para vincular ao pedido ou evitar duplicidade (**GET** `/contatos`, **POST** se necessário). |
| **Produtos** | Opcional: consultar ou sincronizar produtos no Bling para alinhar itens do pedido (**GET** `/produtos`, **POST** se necessário). |

**NF-e e logística:** A emissão de NF-e e o gerenciamento de logística (etiquetas, envios, rastreio) ficam a cargo do próprio Bling, após o pedido ter sido criado na conta do cliente via API. O aplicativo não emite NF-e nem gerencia logística; apenas envia o pedido aprovado para o Bling.

A documentação oficial dos endpoints, payloads e limites (ex.: 3 req/s, 120 mil req/dia) está em: [Bling Developers](https://developer.bling.com.br/).

---

## Suporte

Para dúvidas, problemas ou solicitações relacionadas ao aplicativo Gerenciador de Pedidos (WhatsApp), entre em contato pelo canal definido pelo desenvolvedor/fornecedor da solução (e-mail, WhatsApp ou formulário indicado na página do aplicativo no Bling). Informe sempre o contexto (ex.: tela, ação realizada e mensagem de erro, se houver) para agilizar o atendimento.
