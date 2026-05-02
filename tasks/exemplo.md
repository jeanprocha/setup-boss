# TASK

## Descrição

Evoluir a landing page de sofás existente no projeto `landing-sofas`, garantindo uma página comercial completa para captação de leads via WhatsApp.

A landing deve conter:

- hero com proposta de valor clara
- seção de benefícios
- seção de produtos/modelos de sofás
- CTA principal para WhatsApp
- CTA final reforçando orçamento/atendimento
- conteúdo placeholder aceitável para ambiente de desenvolvimento

---

## Acceptance Level (OBRIGATÓRIO)

Escolha apenas um:

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] `index.html` contém hero, benefícios, produtos e CTA final
- [ ] há pelo menos 3 produtos/modelos de sofás
- [ ] todos os CTAs de WhatsApp usam o padrão existente do projeto:
  - `data-wa-href`
  - `data-wa-msg`
  - `data-wa-placement`
- [ ] o `<body>` mantém `data-whatsapp`
- [ ] `js/main.js` não é substituído por lógica paralela
- [ ] `css/styles.css` mantém layout responsivo
- [ ] nenhum arquivo fora do projeto `landing-sofas` é alterado
- [ ] saída do Cursor informa arquivos alterados e validações feitas

---

## Fora de escopo

- configurar número real de WhatsApp
- publicar em produção
- adicionar backend
- adicionar framework
- adicionar dependências
- alterar arquitetura do projeto

---

## Observações

- Pode reutilizar a estrutura existente do `index.html`
- Pode usar conteúdo e imagens mockadas
- Placeholders são aceitos porque o nível é `development`