# TASK

## Descrição

Adicionar um CTA único de teste dentro da seção `#destaque` da página `index.html`.

---

## Acceptance Level (OBRIGATÓRIO)

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] Dentro da `<section id="destaque">` existe um novo bloco com `data-test-id="cta-step-3-proof"`
- [ ] O bloco contém o texto exato: "Atendimento rápido para escolher seu sofá"
- [ ] O bloco contém um botão de WhatsApp com:
  - `data-wa-href`
  - `data-wa-msg="Quero atendimento rápido para escolher meu sofá"`
  - `data-wa-placement="cta-step-3-proof"`
- [ ] O bloco foi adicionado dentro da seção `#destaque`
- [ ] Nenhum conteúdo existente da seção `#destaque` foi removido
- [ ] `js/main.js` NÃO foi alterado
- [ ] `css/styles.css` NÃO foi removido
- [ ] o Review valida usando o estado real do arquivo `index.html`

---

## Fora de escopo

- criar nova seção
- alterar estrutura do `<body>`
- alterar outras seções
- alterar `js/main.js`
- alterar `css/styles.css`
- adicionar dependências
- refatorar código existente

---

## Observações

- `data-test-id="cta-step-3-proof"` deve ser único
- não reutilizar CTAs existentes
- pode usar HTML simples