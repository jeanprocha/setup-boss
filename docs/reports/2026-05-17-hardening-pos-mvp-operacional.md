# Hardening pós-MVP operacional

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** Ajustes finais de produto após validação ponta a ponta (aprovação → versionamento → execução → review → finalização)

---

## Resumo

Pacote de hardening com seis frentes: publicação manual de branch na Finalização, deduplicação de marcos nos logs operacionais, correções do documento de Review (progresso, critérios, validações humanizadas) e subtítulos coerentes por fase operacional.

---

## Arquivos alterados

| Área | Ficheiros |
|------|-----------|
| Push branch | `scripts/daemon/lib/run-git-push-api.js`, `scripts/daemon/runtime-api.js`, `core/map-run-git-for-ui.js` |
| Frontend push | `frontend/lib/runtime/git/git-push-actions.ts`, `git-push-error-messages.ts`, `hooks/use-git-push-mutation.ts`, `FinalizationPhasePanel.tsx` |
| Git DTO | `frontend/lib/api/runtime-types.ts`, `map-run-git-summary.ts` |
| Review | `build-operational-review-document.ts`, `operational-review-event-labels.ts`, `ReviewPhasePanel.tsx` |
| Logs | `dedupe-runtime-events.ts`, `normalize-runtime-log-for-ui.ts` |
| UX fases | `operational-ux-selectors.ts`, `ApprovalPhasePanel.tsx`, `VersioningPhasePanel.tsx`, `ExecutionPhasePanel.tsx`, `RunViewShell.tsx` |
| Finalização checklist | `build-operational-finalization-summary.ts` |

---

## 1. Publicar branch (Finalização)

### Comportamento

- Novo endpoint **`POST /runs/:id/git-push`** (confirmação humana na UI; sem push automático).
- Fluxo: utilizador clica **Publicar branch** → confirma → `git push` da `activityBranch` para `origin`.
- Resposta inclui `branch`, `remote`, `remoteUrl` (quando disponível) e estado persistido em `run-context.git.push`.
- Mensagem explícita: **PR, merge e deploy não são automatizados**.

### Regras técnicas

- Tenta primeiro `tryGitPushAfterApprovedCommit` com `SETUP_BOSS_GIT_AUTO_PUSH=true` (se houver commit).
- Se falhar por `git_push_commit_required`, faz push explícito com gates: `git_branch_ready`, HEAD = `activityBranch`, remote `origin`, sem force push.
- Idempotente se `git.push.status === pushed` para a mesma branch.
- Evento `git_branch_pushed` emitido no sucesso.

### UI

- Bloco **Publicar branch** em `FinalizationPhasePanel` (duplo clique: pedir → confirmar).
- Checklist: linha **Branch publicada** (`branchPublishedRow`).

---

## 2. Deduplicação de logs operacionais

### Regra

Em `dedupeRuntimeEvents`, eventos cujo `type` corresponde a marcos operacionais (`execution_started`, `execution_triggered`, `execution_completed`, `git_branch_prepared`, etc.) dedupe por **`milestone:{type}:{runId}`**, mantendo o último por ordem temporal.

### Efeito

- Vista operacional / feed: **um marco por tipo de evento por corrida**.
- Stream técnico completo inalterado (filtro só na UI operacional).

Labels PT adicionados em `normalize-runtime-log-for-ui.ts` para tipos de execução frequentes.

---

## 3. Review — progresso 0/5

- Quando `isExecutionOperationallyComplete`, o resumo mostra **«Execução concluída.»** em vez de `0/N etapas`.
- Ratio `completed/total` só aparece se `completed > 0` (evita `0/5` enganoso).
- Checklist de finalização: detalhe de execução sem ratio quando `total === 0`.

---

## 4. Critérios duplicados

- `dedupeCriteriaLabels()` normaliza por texto (remove prefixo `Critério:`, lowercase).
- Critérios com execução completa passam a **Atendido** quando há labels.

---

## 5. Validações e testes (humanizadas)

- Novo `operational-review-event-labels.ts` traduz códigos (`execution_runtime_started`, `subtask_execution_initialized`, etc.).
- JSON cru na secção **Validações e testes** → mensagem genérica a apontar para execução técnica.
- `detail` de diagnósticos deixa de expor código técnico como label principal.

---

## 6. Títulos e subtítulos por fase

`operationalPhaseSubheadline()` centraliza copy:

| Fase | Subtítulo |
|------|-----------|
| Aprovação | Aguardando sua decisão |
| Versionamento | Confirme o versionamento |
| Execução | Preparando execução / Executando |
| Review | Aguardando sua validação |
| Finalização | Pronto para encerrar / Atividade finalizada |

Painéis de fase passam a usar `operationalPhaseLabelForUi` + `operationalPhaseSubheadline` (incl. `RunViewShell` com `operationalUx` em Review, Execução e Finalização).

---

## Validação manual sugerida

1. **Finalização:** com branch preparada, publicar branch com confirmação; ver mensagem com `origin/branch`; `git fetch` noutro clone deve ver a branch.
2. Confirmar que **não** há criação de PR automática.
3. **Logs operacionais:** não repetir «Execução iniciada» / «Execução concluída» múltiplas vezes para o mesmo run.
4. **Review:** execução concluída sem `0/5`; critérios sem duplicados; validações legíveis (sem JSON principal).
5. Percorrer fases e confirmar subtítulos coerentes (sem copy de aprovação na fase Review).

---

## Limitações

- Push exige `origin` configurado e credenciais Git locais do daemon.
- Sem commit local, push explícito ainda envia o estado actual da branch (pode não incluir alterações não commitadas).
- `remoteUrl` depende de `git config remote.origin.url` no projecto-alvo.
- Deduplicação de marcos aplica-se na camada de eventos agregados; logs daemon brutos na vista **full** mantêm entradas completas.
- Nenhum mock novo foi criado.

---

## Critérios de aceite

- [x] Publicar branch com confirmação humana (API + UI)
- [x] Sem PR/merge/deploy automáticos
- [x] Dedupe de marcos operacionais de execução
- [x] Review sem 0/5 enganoso
- [x] Critérios deduplicados
- [x] Validações humanizadas no Review
- [x] Subtítulos de fase coerentes
- [x] Sem mocks novos
