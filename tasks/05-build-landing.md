# TASK

## Descrição

Consolidar a seção `#destaque` como um bloco comercial completo da landing page de sofás.

---

## Acceptance Level (OBRIGATÓRIO)

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] Dentro da `<section id="destaque">` existe um bloco com `data-test-id="landing-step-5"`
- [ ] O bloco contém o título exato: "Encontre o sofá ideal para sua casa"
- [ ] O bloco contém uma lista de benefícios com pelo menos 3 itens:
  - conforto
  - entrega
  - atendimento
- [ ] O bloco contém pelo menos 3 produtos de sofá
- [ ] O bloco contém um CTA final com:
  - `data-wa-href`
  - `data-wa-msg="Quero montar minha sala com o sofá ideal"`
  - `data-wa-placement="landing-step-5"`
- [ ] Nenhum conteúdo existente da seção `#destaque` foi removido
- [ ] `js/main.js` NÃO foi alterado
- [ ] `css/styles.css` NÃO foi removido
- [ ] o Review valida usando o estado real do `index.html`

---

## Fora de escopo

- criar nova seção global
- alterar estrutura do `<body>`
- alterar ordem das seções
- alterar `js/main.js`
- alterar `css/styles.css`
- adicionar dependências
- refatorar código existente

---

## Observações

- adicionar tudo dentro de `#destaque`
- não reutilizar blocos existentes
- usar HTML simples
- usar `data-test-id="landing-step-5"` como identificador único