# Setup Boss — Web UI MVP Runtime

Documentação do runtime operacional exposto à Mission Control (Next.js) via Runtime API local.

---

## Arquitetura

```
┌─────────────────┐     proxy      ┌──────────────────┐     HTTP      ┌─────────────┐
│  Mission Control │ ─────────────► │  Next.js /api/   │ ────────────► │ setup-bossd │
│  (frontend)      │   SSE + REST   │  runtime/*       │  127.0.0.1    │ runtime-api │
└─────────────────┘                └──────────────────┘               └──────┬──────┘
                                                                              │
                                                                              ▼
                                                                    fila + workers + artefactos
                                                                    (.setup-boss/, outputs/)
```

- **Source of truth:** artefactos em disco (`docs/.IA/outputs/<runId>/`, `orchestration-state.json`, `run-context.json`).
- **Read models:** `GET /runs/:id/clarification|strategy|execution|evidence|orchestration`.
- **Mutations:** `POST /runs`, `POST /runs/:id/clarification/*`, `POST /runs/:id/execute`.
- **Realtime:** `GET /events/stream?projectId=` (SSE) + polling de fallback.

---

## Componentes frontend

| Área | Responsabilidade |
|------|------------------|
| `MissionRuntimeRoot` | Ligação SSE, recovery, orchestration store |
| `useRuntimeSse` | Stream + resync pós-reconnect |
| `useExecution` / `useClarification` / `useStrategy` | Read models por fase |
| `runtime-event-bus` | Dedup + invalidação React Query |
| `orchestration-*` | Bootstrap, live sync, recovery |

---

## Backend (daemon)

| Módulo | Papel |
|--------|------|
| `runtime-api.js` | HTTP surface |
| `run-intake-api.js` | `POST /runs` |
| `run-clarification.js` | Clarificação HITL |
| `run-strategy.js` | Read model estratégia |
| `run-execution.js` | Read model execução |
| `run-execute-api.js` | Trigger + orchestration bootstrap |
| `run-orchestration-sync.js` | Sync artefactos → orchestration |
| `run-runtime-rehydration.js` | Recovery no boot |
| `runtime-consistency-check.js` | Validação coerência read models |

---

## Validação operacional

```bash
npm run smoke:mvp-web-ui-e2e
node --test scripts/daemon/lib/runtime-consistency-check.test.js
cd frontend && npm run build
```

Ver também: `web-ui-runtime-lifecycle.md`, `web-ui-operational-flow.md`, `web-ui-recovery-and-rehydration.md`, `web-ui-known-limitations.md`.
