# TASK

## Descrição

Adicionar um bloco de destaque de promoção no final da página.

---

## Acceptance Level (OBRIGATÓRIO)

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] `index.html` contém um novo bloco `<section id="promocao">`
- [ ] a seção contém o texto: "Promoção especial de sofás"
- [ ] a seção contém um botão de WhatsApp com:
  - `data-wa-href`
  - `data-wa-msg="Quero saber da promoção"`
  - `data-wa-placement="promocao"`
- [ ] a seção foi adicionada no FINAL do `<body>`
- [ ] `js/main.js` NÃO foi alterado
- [ ] `css/styles.css` NÃO foi removido
- [ ] saída do Executor lista arquivos alterados

---

## Fora de escopo

- alterar outras seções
- alterar layout existente
- adicionar dependências
- refatorar código

---

## Observações

- a seção deve ser nova (não reutilizar existente)
- pode usar HTML simples