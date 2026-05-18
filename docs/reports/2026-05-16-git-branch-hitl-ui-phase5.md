# Fase 5 — UI/HITL para preparar branch

**Data:** 2026-05-16  
**Tipo:** implementação (Mission Control — acção humana Git)  
**Relacionado:** `docs/reports/2026-05-16-git-branchhint-phase4.md`, `docs/reports/2026-05-16-git-execute-gate-phase3.md`

---

## Alterações realizadas

1. **`PrepareGitBranchCard`** — card HITL em `OrchestrationRunControls` (único ponto, sem CTA duplicado)
   - Título: «Preparar branch da atividade»
   - Explica branches protegidas
   - Bloco «Estado Git» (status, branchHint / activityBranch)
   - Botão «Preparar branch» → `POST /runs/:id/git-branch` com `{}`

2. **`postPrepareGitBranch`** (`git-branch-actions.ts`)
   - Fetch dedicado com timeout 120s
   - Parse de erros `{ ok, error: string, message }` da API git-branch
   - `PrepareGitBranchError` com `code` para mensagens UI

3. **`git-branch-error-messages.ts`** — mensagens PT seguras por código

4. **`useGitBranchMutation`** — invalida `projectRuns` + bundles da corrida após sucesso

5. **`git-branch-cta-visibility.ts`** — `shouldShowGitBranchPrepareCta` só quando `availability.reason === git_branch_required` e não `git_branch_ready`

**Fora de escopo:** commit, push, PR, worktree, nome customizável, E2E browser, layout grande.

---

## Arquivos alterados

| Arquivo | Acção |
|---------|--------|
| `frontend/components/features/git-branch/PrepareGitBranchCard.tsx` | **novo** |
| `frontend/components/features/orchestration/OrchestrationRunControls.tsx` | integra card |
| `frontend/lib/runtime/git/git-branch-actions.ts` | **novo** |
| `frontend/lib/runtime/git/git-branch-error-messages.ts` | **novo** |
| `frontend/lib/runtime/git/git-branch-cta-visibility.ts` | **novo** |
| `frontend/hooks/use-git-branch-mutation.ts` | **novo** |
| `frontend/lib/runtime/git/*.test.ts` | **novo** (3 ficheiros) |
| `docs/reports/2026-05-16-git-branch-hitl-ui-phase5.md` | **novo** |

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| Card só em `OrchestrationRunControls` | Evita CTAs duplicados (único sítio do Execute Run) |
| Visibilidade por `availability.reason` | Respeita prioridade clarificação/strategy já em `deriveExecuteAvailability` |
| Fetch dedicado vs `runtimePostJson` | API git-branch devolve `error` como string no topo |
| Payload `{}` | Nome automático no backend (Fase 5) |
| Refetch `projectRuns` após sucesso | Atualiza `branchHint` / `git` / `executeBlockCode` |
| Erros: 1ª linha, sem `at ` | Não vazar stack |

---

## Testes executados

```text
cd frontend && npx tsx --test \
  lib/runtime/git/git-branch-cta-visibility.test.ts \
  lib/runtime/git/git-branch-error-messages.test.ts \
  lib/runtime/git/git-branch-actions.test.ts \
  lib/runtime/orchestration/orchestration-state-git.test.ts \
  lib/runtime/adapters/map-job-git.test.ts
```

| Cenário | Resultado |
|---------|-----------|
| CTA com `git_branch_required` | OK |
| Sem CTA para clarification/strategy pending | OK |
| POST com body `{}` | OK (mock fetch) |
| `git_dirty_worktree` mensagem segura | OK |
| `git_branch_ready` esconde CTA | OK |

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Lista de jobs refetch lenta após prepare | Timeout 120s + loading no botão |
| Utilizador não vê card fora do painel Execução | Card está onde já existe Execute Run |
| Erro API com formato novo | `parseGitBranchApiErrorBody` + fallback genérico |

---

## Próximos passos

1. Nome de branch editável na UI
2. Passo no pipeline operacional / timeline `git_branch_prepared`
3. Commit pós-review
4. E2E browser smoke do fluxo completo

---

## Resumo

A Fase 5 adiciona o primeiro HITL Git no Mission Control: card «Preparar branch» visível apenas quando o bloqueio dominante é `git_branch_required`, chamada a `POST /runs/:id/git-branch` com nome automático, e refresh dos dados do run para desbloquear Execute quando a branch estiver pronta.
