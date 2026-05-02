# Correction Prompt

## Objetivo da correção

Corrigir a submissão da task da landing page de sofás em `landing-sofas` apresentando **evidência verificável da implementação já feita ou ajustando apenas o necessário para atender aos critérios de aceite**, sem ampliar escopo. O foco principal é garantir que a entrega contenha os elementos exigidos e que a **saída final do Cursor comprove isso objetivamente**.

## Problemas apontados no Review

- Não há evidência objetiva de alterações reais no código de `landing-sofas`.
- Não foram apresentados trechos/diff de `index.html`, `css/styles.css` ou `js/main.js` para comprovar os critérios de aceite.
- Não há prova de que `index.html` contenha hero, benefícios, produtos e CTA final após a implementação.
- Não há prova de existência de pelo menos 3 produtos/modelos de sofás.
- Não há prova de que todos os CTAs de WhatsApp usem `data-wa-href`, `data-wa-msg` e `data-wa-placement`.
- Não há prova de que o `<body>` mantém `data-whatsapp`.
- Não há prova de que `js/main.js` foi preservado sem lógica paralela.
- Não há prova de que a responsividade em `css/styles.css` foi mantida.
- Não há prova de que nenhum arquivo fora de `landing-sofas` foi alterado.
- A saída do Cursor não informa arquivos alterados nem validações feitas.

## Ajustes necessários

- Verificar o estado atual dos arquivos dentro de `landing-sofas`.
- Se `index.html` ainda não atender totalmente, ajustar apenas o necessário para incluir:
  - hero
  - benefícios
  - seção de produtos/modelos
  - CTA principal
  - CTA final
- Garantir no HTML a presença de pelo menos 3 produtos/modelos de sofás.
- Garantir que **todos os CTAs de WhatsApp** usem:
  - `data-wa-href`
  - `data-wa-msg`
  - `data-wa-placement`
- Confirmar que o `<body>` mantém `data-whatsapp`.
- Verificar `js/main.js` e **não criar lógica paralela**; apenas preservar a integração existente.
- Verificar `css/styles.css` e manter a responsividade já existente, ajustando somente se necessário para suportar a landing.
- Não alterar nenhum arquivo fora de `landing-sofas`.
- Na resposta final, incluir:
  - lista exata de arquivos alterados
  - resumo das validações realizadas
  - trechos relevantes ou diff dos arquivos principais alterados

## Instruções para o Cursor

1. Trabalhar **somente dentro do projeto `landing-sofas`**.
2. Antes de alterar qualquer coisa, revisar os arquivos atuais para confirmar o que já existe e o que realmente precisa ser corrigido.
3. Alterar apenas os arquivos necessários para satisfazer os critérios já definidos na task original.
4. Em `index.html`, garantir evidência clara de:
   - hero com proposta de valor
   - seção de benefícios
   - seção com pelo menos 3 produtos/modelos
   - CTA principal para WhatsApp
   - CTA final reforçando orçamento/atendimento
5. Em todos os botões/links de WhatsApp da landing, usar o padrão existente do projeto com:
   - `data-wa-href`
   - `data-wa-msg`
   - `data-wa-placement`
6. Preservar o atributo `data-whatsapp` no `<body>`.
7. Não substituir `js/main.js` por script paralelo, inline script novo ou lógica duplicada. Se `js/main.js` não precisar mudar, declarar isso explicitamente na saída.
8. Manter o layout responsivo em `css/styles.css`; se houver ajuste CSS, limitar ao suporte da landing sem refatoração ampla.
9. Não adicionar dependências, frameworks, backend ou nova arquitetura.
10. Ao finalizar, responder com:
    - arquivos realmente alterados
    - confirmação explícita de que nenhum arquivo fora de `landing-sofas` foi modificado
    - validações executadas contra cada critério de aceite
    - trechos finais ou diff relevantes de `index.html`, `css/styles.css` e `js/main.js` (se alterado)

## Arquivos prováveis de atuação

- `landing-sofas/index.html`
- `landing-sofas/css/styles.css`
- `landing-sofas/js/main.js`

## O que não deve ser alterado

- Não alterar arquivos fora de `landing-sofas`.
- Não adicionar novas features além da landing pedida.
- Não criar nova arquitetura ou reorganização de pastas.
- Não adicionar dependências.
- Não substituir a lógica existente de WhatsApp por implementação paralela.
- Não refatorar CSS ou JS fora do necessário para atender aos critérios já aprovados.
- Não transformar warnings em mudanças obrigatórias sem evidência no review.

## Critério de sucesso

- Há evidência concreta de implementação em `landing-sofas`.
- `index.html` contém hero, benefícios, produtos e CTA final.
- Existem pelo menos 3 produtos/modelos de sofás.
- Todos os CTAs de WhatsApp exibidos na landing usam `data-wa-href`, `data-wa-msg` e `data-wa-placement`.
- O `<body>` mantém `data-whatsapp`.
- `js/main.js` foi preservado sem lógica paralela.
- `css/styles.css` mantém comportamento responsivo.
- Nenhum arquivo fora de `landing-sofas` foi alterado.
- A saída final informa claramente os arquivos alterados, os trechos/diff relevantes e as validações feitas, permitindo nova aprovação pelo Reviewer.