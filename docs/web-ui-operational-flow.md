# Web UI — Fluxo Operacional

Guia do operador: criar run → concluir no Mission Control.

---

## 1. Pré-requisitos

- Daemon activo: `node scripts/daemon/setup-bossd.js` (ou serviço equivalente).
- Frontend: `cd frontend && npm run dev` (proxy para Runtime API).
- Projeto registado em `GET /projects` (ou path absoluto no `projectId`).

---

## 2. Criar run

**UI:** formulário de nova task no sidebar.

**API:**

```http
POST /runs
{ "projectId": "<path ou proj_*>" , "task": "<texto ≥12 chars>", "metadata": { "skipLlm": false } }
```

Resposta: `runId`, `initialState`, `jobId`.

---

## 3. Clarificação

1. Responder perguntas → `POST /runs/:id/clarification/answers`
2. Refinar (se necessário) → `POST …/refine`
3. Aprovar → `POST …/approve` (dispara strategy runtime)

Bloqueios: approve sem refine → `clarification_not_ready`.

---

## 4. Estratégia

Read-only na UI: subtasks, ordem linear, readiness.

`GET /runs/:id/strategy` — requer `strategy_ready` após approve.

---

## 5. Executar

`POST /runs/:id/execute` enfileira job `run_execute` → worker `execute.js`.

UI mostra orchestration banner, timeline, stream de eventos.

---

## 6. Observabilidade

| Superfície | Endpoint / origem |
|------------|-------------------|
| Evidência | `GET /runs/:id/evidence` |
| Execução | `GET /runs/:id/execution` |
| Orchestration | `GET /runs/:id/orchestration` |
| Eventos | SSE + `GET /events` |

---

## 7. Degraded / offline

| Modo | Comportamento UI |
|------|------------------|
| Runtime offline | `connection.reachable=false`, mocks ou empty states |
| SSE degraded | polling mais frequente (10–18s) |
| SSE connected | polling execution 20s, events 45s |
| Reconnect | `resyncRuntimeAfterReconnect` (throttle 2s) |

---

## 8. Validação E2E

```bash
npm run smoke:mvp-web-ui-e2e
```

Cobre lifecycle in-process + API + SSE sample + recovery pós-restart.
