# Relatório — Review e correção granular por miniActivity (Slice 3)

**Data:** 2026-05-17  
**Fase:** 6 — Execução materializada por mini-task  
**Pré-requisitos:** [Slice 1](./2026-05-17-oes-materialized-execution-slice1.md), [Slice 2](./2026-05-17-oes-materialized-execution-slice2.md)

---

## Resumo

Cada **miniActivity** passa a ter ciclo próprio de **review** e **correção**, ligado ao runtime existente (`run-execution-review`, `run-correction-runtime`) sem reescrever o executor sequencial. O estado operacional vive em `execution/execution-runtime-state.json` via `core/update-execution-runtime-state.js`.

---

## Decisão de estados

| Campo | Valores | Uso |
|-------|---------|-----|
| `status` | `review` (durante review/correção pendente) | Lifecycle principal inalterado |
| `reviewStatus` | `pending` \| `running` \| `approved` \| `rejected` \| `blocked` | Review granular |
| `correctionPhase` | `none` \| `correction_required` \| `correction_running` | Subestado de correção |
| `correctionRequired` | boolean | Flag operacional |
| `correctionRef` | path relativo | `execution/results/NNN-correction-loop.json` |
| `reviewArtifactRef` | path relativo | `execution/results/NNN-execution-review.json` |
| `reviewedAt` | ISO | Momento da decisão de review |

**Fluxo rejeitado com correção:**

```
running → review (reviewStatus=running)
       → review (reviewStatus=rejected, correctionPhase=correction_required)
       → correction_running
       → running (re-execução MVP)
       → review (evento review_retried)
       → completed (reviewStatus=approved)
```

Review **blocked** → `status=failed`. Review **approved** → `status=completed`.

---

## Histórico operacional

`operationalHistory[]` por miniActivity:

- `review_started` / `review_retried`
- `review_approved` / `review_rejected` / `review_blocked`
- `correction_started` / `correction_completed` / `correction_failed`

Cada entrada: `type`, `at`, `reason`, `miniTaskId`, `artifactRef?`, `subtaskRef?`.

`transitionHistory[]` continua a registar mudanças de `status`.

---

## Módulos alterados

| Módulo | Alteração |
|--------|-----------|
| `core/update-execution-runtime-state.js` | API review/correction + `operationalHistory` |
| `core/materialize-execution-runtime-from-oes.js` | Campos default na materialização |
| `core/map-execution-runtime-state-dto.js` | DTO com review/correction |
| `scripts/runtime/execution-runtime/run-execution-review.js` | `tryApplyMiniActivityReviewStarted/Outcome` |
| `scripts/runtime/execution-runtime/run-correction-runtime.js` | Hooks correction started/completed/failed |
| `frontend/.../execution-operational-state.ts` | Agrupamento UI + `labelMiniActivityOperational` |
| `frontend/.../ExecutionPhasePanel.tsx` | Secções Correção necessária / Corrigindo + resumo review |

---

## UI mínima

Secção **Execução por mini-tarefa**:

- Em curso / Em revisão / **Correção necessária** / **Corrigindo** / Bloqueadas / Próximas / Falhou / Concluídas
- Resumo curto do review (`reviewSummary`) quando existir
- Indicação discreta “Correção necessária”

---

## Testes

```bash
node --test core/update-execution-runtime-state.test.js
node --test scripts/runtime/execution-runtime/run-execution-runtime.test.js
```

Cobertura slice 3: review running, approved, rejected+correctionRef, correction cycle + review_retried, operationalHistory com artifactRef, legado.

---

## Compatibilidade

| Cenário | Comportamento |
|---------|----------------|
| Sem `execution-runtime-state.json` | Hooks retornam `legacy: true`; runtime subtask inalterado |
| Falha ao patch state | `try*` captura excepção → warning |
| UI sem materialização | Fallback `subtasks` legado |
| Campos novos ausentes no JSON antigo | DTO/adapters usam defaults (`correctionPhase: none`) |

---

## Limitações

1. **Sequencial** — correction loop MVP processa uma subtask por vez; sem paralelismo.
2. **HITL humano** — review continua automático (MVP); UI não expõe approve/reject manual por mini-task.
3. **Sync read-only** — `syncExecutionRuntimeMiniActivities` não reconcilia review granular.
4. **retry_exhausted** — miniActivity vai para `failed`; não há estado intermédio dedicado.

---

## Próximos passos

1. **HITL por mini-task** — gate humano usando `completionCriteria` + `validationHints`.
2. **Timeline operacional** — projectar `operationalHistory` no feed da run.
3. **Retry explícito** — acção UI “repetir mini-tarefa” só na falhada.
4. **Observabilidade** — eventos de review/correction em `execution-diagnostics.json`.
5. **Paralelismo** — fora do MVP sequencial atual.
