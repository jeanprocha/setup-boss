# Fix — `execution_not_applicable` com `uiPhase` stale após versionamento

**Data:** 2026-05-17  
**Tipo:** append-only  
**Discovery:** `docs/reports/2026-05-17-discovery-execution-not-applicable-current-branch-null.md`

---

## Causa raiz

`RunSummaryDto.phase` vinha de `job.metadata.uiPhase`, fixo em `clarify` desde o intake. A UI operacional (Fase 7) avançava para **Execução** com `git_branch_ready`, mas `deriveExecuteAvailability` bloqueava com `execution_not_applicable` porque `phaseRaw` ainda era `clarify`/`clarification`.

`currentBranch: null` nos logs era efeito colateral: o envelope só expõe `currentBranch` quando o gate Git falha; com gate OK e bloqueio só de fase, `expectedBranch` vinha de `activityBranch` e `currentBranch` ficava ausente.

---

## Regra aplicada (frontend)

Em `shouldBlockExecutionNotApplicable` / `deriveExecuteAvailability`:

- Se `phaseRaw` ∈ `{intake, clarify, clarification}` **e**
- **não** houver elegibilidade operacional:

  - plano aprovado (`approval === approved` ou `runtimePhase === ready_for_execution`)
  - `phase2Status` compatível com execução (`ready_for_execution` ou ausente com runtime pronto)
  - `git.status === git_branch_ready`

→ bloquear com `execution_not_applicable`.

Caso contrário (artefactos prontos, fase job stale) → **não** bloquear por fase; seguir para gates Git, execução activa, etc.

---

## Promoção de `uiPhase` (backend)

Módulo `scripts/daemon/lib/promote-job-ui-phase.js`:

- Localiza job de intake da run (ignora `run_execute`).
- Promove só **para cima** (`clarify` < `strategy` < `execution`).
- Nunca regrede fase em jobs antigas.

| Marco | `uiPhase` | `uiState` (quando aplicável) |
|-------|-----------|------------------------------|
| Plano aprovado (`run-clarification.js`) | `strategy` | `ready_for_execution` |
| Strategy concluída (`run-strategy-api.js`) | `strategy` | `strategy_ready` |
| Branch preparada (`run-git-branch-api.js`, incl. idempotente) | `execution` | `ready_for_execution` |

---

## Logs operacionais (frontend)

`log-stale-ui-phase-execute-observation.ts` — uma entrada por run (dedupe):

- Categoria `execution`, evento `stale_ui_phase_execute_bypass`
- Mensagem: fase técnica desatualizada + se execução liberada ou bloqueio seguinte (ex. Git)
- Detalhe: `phaseRawPrevious`, `canExecute`, `blockReason`, `operational` (approval, runtimePhase, phase2Status, gitStatus, activityBranch)

Disparo em `use-orchestration.ts` quando `isStaleEarlyJobPhase` + artefactos operacionais prontos.

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/runtime/orchestration/operational-execute-readiness.ts` | **Novo** — critério operacional + `shouldBlockExecutionNotApplicable` |
| `frontend/lib/runtime/orchestration/orchestration-state.ts` | Usa bypass antes de `execution_not_applicable` |
| `frontend/lib/runtime/orchestration/log-stale-ui-phase-execute-observation.ts` | **Novo** — log deduplicado |
| `frontend/hooks/use-orchestration.ts` | Observabilidade stale phase |
| `scripts/daemon/lib/promote-job-ui-phase.js` | **Novo** — promoção monotónica de `uiPhase` |
| `scripts/daemon/lib/run-clarification.js` | Promove → `strategy` no approve |
| `scripts/daemon/lib/run-strategy-api.js` | Promove → `strategy` no complete |
| `scripts/daemon/lib/run-git-branch-api.js` | Promove → `execution` no prepare |
| `frontend/lib/runtime/orchestration/operational-execute-readiness.test.ts` | **Novo** |
| `scripts/daemon/lib/promote-job-ui-phase.test.js` | **Novo** |
| `package.json` | Registo dos testes |

---

## Como validar manualmente

1. Nova corrida (ou run com `uiPhase: clarify` no job): aprovar plano → strategy → preparar branch.
2. Abrir fase **Execução** na UI.
3. Confirmar que **não** aparece «Execução não aplicável nesta fase».
4. Painel de diagnóstico: entrada `stale_ui_phase_execute_bypass` (se `phase` ainda `clarify` antes do refresh do job).
5. Com HEAD na `activityBranch`: auto-start ou POST `/execute` dispara; `execution_triggered` na fila.
6. Com HEAD errada: bloqueio **`git_branch_mismatch`** (gate real), não `execution_not_applicable`.
7. Após prepare, `queue.json` do job de intake deve mostrar `uiPhase: execution` (ou `strategy` antes do prepare).

**Testes automáticos:**

```bash
node --test frontend/lib/runtime/orchestration/operational-execute-readiness.test.ts
node --test scripts/daemon/lib/promote-job-ui-phase.test.js
```

---

## Limitações

- Runs **só com frontend antigo** e job nunca re-promovido: o bypass por artefactos cobre; `summary.phase` pode continuar `clarify` até refresh após promoção backend.
- Promoção actua no **job de intake** na fila local; não altera executor, worker, DAG, review ou finalização.
- Log stale phase: **uma vez por run** por sessão UI (dedupe em memória).
- `git_branch_mismatch` e outros gates Git **mantêm-se** — este fix não substitui checkout correcto.
- Jobs sem entrada na fila (`no_job`): promoção backend é no-op; frontend bypass continua a aplicar-se.

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| Não bloqueia `execution_not_applicable` após approve + branch ready | OK (regra + testes) |
| Erro real (ex. `git_branch_mismatch`) mantém-se | OK |
| Promoção `uiPhase` nos marcos | OK |
| Logs explicam fase stale | OK |
| Sem mocks novos | OK |
