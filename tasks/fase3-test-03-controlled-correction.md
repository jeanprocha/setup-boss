# TASK

## Descrição

Adicionar um bloco de validação da Fase 3 dentro da seção `#destaque`, com critérios intencionalmente rigorosos para validar o ciclo de correção automática.

---

## Acceptance Level (OBRIGATÓRIO)

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] Dentro da `<section id="destaque">` existe um novo bloco com `data-test-id="fase3-test-03"`
- [ ] O bloco contém o texto exato: "Fase 3 validada: correção automática testada"
- [ ] O bloco contém o atributo `data-validation="auto-correction"`
- [ ] O bloco contém o atributo `data-review-target="strict"`
- [ ] O bloco contém um botão de WhatsApp com:
  - `data-wa-href`
  - `data-wa-msg="Quero validar correção automática"`
  - `data-wa-placement="fase3-test-03"`
- [ ] O botão contém o texto exato: "Validar correção automática"
- [ ] Nenhum conteúdo existente da seção `#destaque` foi removido
- [ ] `js/main.js` NÃO foi alterado
- [ ] `css/styles.css` NÃO foi removido
- [ ] o Review valida usando o estado real do arquivo `index.html`
- [ ] a execução finaliza com `knowledge`

---

## Fora de escopo

- criar nova seção global
- alterar layout completo
- alterar `js/main.js`
- alterar `css/styles.css`
- adicionar dependências
- refatorar código existente

---

## Observações

- inserir apenas dentro de `#destaque`
- usar HTML simples
- `data-test-id="fase3-test-03"` deve ser único
- os atributos `data-validation` e `data-review-target` devem estar no bloco principal