# TASK

## Descrição

Adicionar ou garantir um placeholder descritivo no campo de busca da agenda diária.

O placeholder deve orientar o usuário sobre o que pode ser pesquisado.

---

## Acceptance Level (OBRIGATÓRIO)

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] `components/AgendaDiaria.tsx` possui placeholder descritivo no campo de busca
- [ ] o placeholder é exibido corretamente quando o campo estiver vazio
- [ ] o placeholder não interfere na lógica atual de busca
- [ ] se o placeholder já existir corretamente implementado, o executor retorna NO-OP com evidência concreta
- [ ] se o placeholder não existir, o executor aplica PATCH válido
- [ ] a alteração não remove funcionalidades existentes de busca, filtro, seleção ou edição
- [ ] saída do Executor lista arquivos alterados ou justifica NO-OP

---

## Fora de escopo

- Alterar arquivos fora de `components/AgendaDiaria.tsx`
- Alterar scripts do Setup Boss
- Alterar outputs da pasta `.IA`
- Alterar schema, executor, review ou architect
- Refatorar layout geral
- Adicionar dependências
- Alterar APIs ou backend

---

## Observações

Esta task deve ser executada sem aumentar `EXECUTOR_CONTEXT_SNIPPET_SIZE`.

Priorizar alteração pequena e local em elemento de input já existente.