# TASK

## Descrição

Validar o contexto direcionado no executor usando o projeto agenda-diaria.

O objetivo é confirmar que o executor recebe trechos relevantes de arquivos grandes via targeted snippets, sem precisar aumentar EXECUTOR_CONTEXT_SNIPPET_SIZE.

---

## Acceptance Level (OBRIGATÓRIO)

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] O pipeline executa sem erro de validação da task
- [ ] O executor-input.md contém a seção Targeted snippets
- [ ] O executor recebe contexto relevante de components/AgendaDiaria.tsx
- [ ] A execução não depende de EXECUTOR_CONTEXT_SNIPPET_SIZE=24000
- [ ] O executor não bloqueia por snippet insuficiente
- [ ] Se a funcionalidade já estiver implementada, o executor retorna NO-OP com evidência concreta
- [ ] Se houver alteração necessária, o executor aplica PATCH válido
- [ ] O review aprova corretamente o resultado

---

## Fora de escopo

- Alterar scripts/executor.js
- Alterar schema do executor
- Alterar review
- Alterar architect
- Alterar docs
- Alterar configurações globais
- Aumentar EXECUTOR_CONTEXT_SNIPPET_SIZE

---

## Observações

Após salvar esta task, executar:

npm run run tasks/task-1.md ../agenda-diaria

Validar também:

- prompt-sizes.json contém blocks.targeted_snippets
- executor.total_prompt_chars foi registrado
- status do executor
- status do review