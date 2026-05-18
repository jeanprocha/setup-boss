# Fase 4 — Persistência + branchHint para UI

**Data:** 2026-05-16  
**Tipo:** implementação (contrato API + adapters, sem UI visual)  
**Relacionado:** `docs/reports/2026-05-16-git-execute-gate-phase3.md`, `docs/reports/2026-05-16-git-prepare-branch-phase2.md`

---

## Alterações realizadas

1. **`core/map-run-git-for-ui.js`** (novo)
   - `mapRunGitForUi(gitState, { executeBlockCode })` → `{ branchHint, git }`
   - `branchHint` só quando `status === git_branch_ready` e `activityBranch` preenchida
   - `git_branch_failed` expõe `errorCode` (allowlist) + `errorMessage` sanitizada (1ª linha, sem stack)
   - `executeBlockCode` propagado do gate server-side

2. **`scripts/daemon/lib/run-git-ui-envelope.js`** (novo)
   - `resolveRunGitUiEnvelope({ runId, projectRoot })` lê `run-context.git` + `validateGitExecuteGate`
   - Calcula bloqueio de execução em tempo real (branch protegida / mismatch / repo inválido)

3. **`scripts/daemon/runtime-api.js`**
   - `summarizeJob` passa a incluir `branchHint` e `git` em cada job com `runId` + `projectRoot`

4. **Frontend**
   - `RunGitSummaryDto` + campos opcionais em `ApiJobSummary` / `RunSummaryDto`
   - `map-run-git-summary.ts` + `map-job.ts` preenchem `branchHint` / `git`
   - `deriveExecuteAvailability` + `ExecuteGuardReason` com códigos `git_*`
   - `use-orchestration.ts` passa `summary.git` ao derivar disponibilidade

**Fora de escopo (confirmado):** botão preparar branch, card HITL, POST visual git-branch, commit, push, PR, worktree, mudanças visuais grandes.

---

## Arquivos alterados

| Arquivo | Acção |
|---------|--------|
| `core/map-run-git-for-ui.js` | **novo** |
| `core/map-run-git-for-ui.test.js` | **novo** |
| `scripts/daemon/lib/run-git-ui-envelope.js` | **novo** |
| `scripts/daemon/lib/run-git-ui-envelope.test.js` | **novo** |
| `scripts/daemon/runtime-api.js` | `summarizeJob` + git UI |
| `frontend/lib/api/runtime-types.ts` | DTOs |
| `frontend/lib/runtime/adapters/map-run-git-summary.ts` | **novo** |
| `frontend/lib/runtime/adapters/map-job.ts` | branchHint + git |
| `frontend/lib/runtime/adapters/map-job-git.test.ts` | **novo** |
| `frontend/lib/runtime/orchestration/orchestration-types.ts` | guard reasons |
| `frontend/lib/runtime/orchestration/orchestration-state.ts` | gate Git na availability |
| `frontend/lib/runtime/orchestration/orchestration-state-git.test.ts` | **novo** |
| `frontend/hooks/use-orchestration.ts` | passa `git` |
| `docs/reports/2026-05-16-git-branchhint-phase4.md` | **novo** |

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| Enriquecer em `summarizeJob` | Única fonte da lista de atividades (`useRuns` → `mapApiJobToRunSummary`) |
| `executeBlockCode` via `validateGitExecuteGate` live | UI alinhada ao POST `/execute` mesmo sem `run-context.git` |
| Runs sem campo `git` → `git: null` | Compatibilidade com corridas antigas |
| Sanitização de `errorMessage` | 1ª linha, max 240 chars, rejeita linhas `at ` / `Error:` |
| Allowlist de `errorCode` / `executeBlockCode` | Evita vazar códigos internos ou stack |
| Git guard após clarificação/strategy na availability | `clarification_pending` continua prioritário sobre git |
| Sem alterar componentes visuais | Fase UI/HITL seguinte consome DTOs já prontos |

### Contrato exposto no job/resumo

```json
{
  "branchHint": "setup-boss/20260516-exemplo",
  "git": {
    "status": "git_branch_ready",
    "activityBranch": "setup-boss/20260516-exemplo",
    "executeBlockCode": "git_branch_required"
  }
}
```

`executeBlockCode` presente apenas quando o gate bloquearia execução. Em `git_branch_ready` alinhado ao HEAD, omitido.

---

## Testes executados

```text
node --test core/map-run-git-for-ui.test.js scripts/daemon/lib/run-git-ui-envelope.test.js
node --test scripts/daemon/lib/run-execute-api.test.js
cd frontend && npx tsx --test lib/runtime/adapters/map-job-git.test.ts lib/runtime/orchestration/orchestration-state-git.test.ts
```

| Cenário | Resultado |
|---------|-----------|
| branchHint com `activityBranch` ready | OK |
| run antigo sem git → null | OK |
| `git_branch_failed` + errorCode seguro | OK |
| main sem git → `executeBlockCode: git_branch_required` | OK |
| availability `git_branch_required` | OK |
| não confunde com `clarification_pending` | OK |
| regressão execute gate Fase 3 | OK |

**29 testes novos/regressão, 0 falhas.**

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| `summarizeJob` chama git por job na listagem | Aceitável no daemon local; cache futuro se necessário |
| UI em branch feature sem `git` no contexto não mostra bloqueio Git | Gate real no POST `/execute`; Fase UI pode pedir refresh |
| Duplicação de regras frontend/backend | `executeBlockCode` vem do mesmo `validateGitExecuteGate` no daemon |

---

## Próximos passos

1. **Fase UI** — botão «Preparar branch», card HITL, `POST /runs/:id/git-branch`
2. Mensagens dedicadas no `ExecuteRunButton` / `OrchestrationRunControls`
3. Timeline `git_branch_*` no pipeline operacional
4. Commit pós-review (discovery)

---

## Resumo

A Fase 4 expõe `branchHint` e `git` no resumo de jobs vindos do daemon, e o frontend propaga `git_branch_required` (e relacionados) em `deriveExecuteAvailability`, sem novos componentes visuais. Runs legados sem `run-context.git` mantêm `branchHint: null` e `git: null`.
