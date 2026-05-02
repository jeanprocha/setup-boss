# TASK

## Descrição

Adicionar um bloco de validação que exige correção automática caso a primeira execução não entregue todos os atributos esperados.

---

## Acceptance Level (OBRIGATÓRIO)

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] Dentro da `<section id="destaque">` existe um novo bloco com `data-test-id="fase3-test-02"`
- [ ] O bloco contém o texto exato: "Fase 3 validada: correction loop funcionando"
- [ ] O bloco contém um botão de WhatsApp com:
  - `data-wa-href`
  - `data-wa-msg="Quero validar o correction loop"`
  - `data-wa-placement="fase3-test-02"`
- [ ] O bloco contém também o atributo `data-validation="correction-loop"`
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
- `data-test-id="fase3-test-02"` deve ser único
- `data-validation="correction-loop"` deve estar no bloco principal