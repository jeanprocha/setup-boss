# Web UI — Runtime Lifecycle

Ciclo de vida operacional do MVP (linear, sem DAG).

---

## Fases

| Ordem | Fase UI | Artefactos / API | Estado típico |
|------|---------|------------------|---------------|
| 1 | Intake | `task-discovery.md`, `task-plan-initial.md` | `POST /runs` |
| 2 | Clarificação | `clarification-questions.json`, answers, `task-plan-refined.md` | `GET/POST …/clarification` |
| 3 | Aprovação | `approval-state.json` | `POST …/approve` |
| 4 | Estratégia | `strategy/*`, `strategy-readiness.json` | `GET …/strategy` |
| 5 | Execução | `execution/*`, subtasks, handoffs | `POST …/execute` |
| 6 | Revisão / correcção | `*-execution-review.json`, correction loops | read model `execution` |
| 7 | Conclusão | lifecycle `execution_completed` | orchestration terminal |
| 8 | Integridade | `runtime-integrity-report.json` | badge integridade |

---

## Orchestration state

Persistido em `orchestration-state.json` + `run-context.json`:

- `queued` → `execution_starting` → `execution_running`
- ramos: `execution_reviewing`, `execution_correcting`, `execution_recovering`
- terminais: `execution_completed`, `execution_failed`

`mapExecutionState(orchestration, lifecycle)` alinha UI badges com artefactos.

---

## Recovery markers

Após restart do daemon:

- `recovery_status`: `recovered` | `stale` | `orphaned` | `recovery_pending`
- exposto em `GET /runs/:id/orchestration` e `GET /runtime/recovery`

---

## Consistência

`validateRuntimeConsistency` verifica:

- orchestration activa exige approval + strategy ready
- lifecycle terminal não coexiste com orchestration activa (erro)
- drift entre bootstrap e execution bundle (warn)

Smoke: `npm run smoke:mvp-web-ui-e2e`.
