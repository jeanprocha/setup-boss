# TASK

## Descrição

Adicionar um novo produto único dentro da seção `#destaque` da página `index.html`.

---

## Acceptance Level (OBRIGATÓRIO)

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] Dentro da `<section id="destaque">` existe um novo bloco de produto
- [ ] O produto contém exatamente:
  - nome: "Sofá Orion Premium"
  - preço: "R$ 2.499"
- [ ] O produto contém um botão de WhatsApp com:
  - `data-wa-href`
  - `data-wa-msg="Quero o Sofá Orion Premium"`
  - `data-wa-placement="produto-orion"`
- [ ] O produto foi INSERIDO dentro da seção `#destaque` (não fora dela)
- [ ] O produto aparece APÓS qualquer conteúdo já existente dentro da seção
- [ ] Nenhum conteúdo existente da seção foi removido
- [ ] `js/main.js` NÃO foi alterado
- [ ] `css/styles.css` NÃO foi removido
- [ ] saída do Executor lista `index.html` como arquivo alterado
- [ ] saída do Executor mostra um snippet contendo:
  - `<section id="destaque">`
  - "Sofá Orion Premium"

---

## Fora de escopo

- criar novas seções
- alterar outras partes da página
- alterar estrutura global
- adicionar dependências
- refatorar código existente

---

## Observações

- o produto deve ser novo (não reutilizar existentes)
- deve ser possível ver claramente o produto dentro da seção no HTML final
- pode usar HTML simples (div, h3, p, a)