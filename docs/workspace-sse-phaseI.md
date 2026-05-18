# Workspace Fase I — SSE `workspace_run.*`

**Data:** 2026-05-17  
**Objetivo:** atualizar Mission Control em tempo real quando WorkspaceRuns mudam, sem redesign.

---

## Arquitetura

| Camada | Componente | Papel |
|--------|------------|-------|
| Backend | `workspace-run-sse.js` | Pub/sub em memória + `notifyWorkspaceRunSse` |
| Backend | `GET /events/stream` | Reutiliza stream SSE existente; eventos nomeados `workspace_run.*` |
| Backend | `workspace-run-sync.js` | Emite em auto-advance / waiting / failed / completed |
| Backend | `runtime-api.js` | Emite em start, resume, retry, skip, prepare-git |
| Frontend | `use-workspace-run-sse.ts` | `EventSource` + invalidação React Query |
| Frontend | `WorkspaceRunViewShell` | Badge Live updates connected/disconnected |

Filtro opcional no stream: `?workspaceId=<id>` (além de `projectId` já existente).

---

## Eventos

| Evento | Quando |
|--------|--------|
| `workspace_run.updated` | Mudança genérica (sync advance, start, resume, git, etc.) |
| `workspace_run.started` | `POST .../start` |
| `workspace_run.advanced` | Sync ou resume com novo child/mini |
| `workspace_run.waiting_user_action` | HITL / sync em waiting |
| `workspace_run.failed` | Child failed / sync failed |
| `workspace_run.completed` | WorkspaceRun concluído |
| `workspace_run.git_updated` | `prepare-git` / `retry-prepare-git` |
| `workspace_run.error` | Erro de advance ou tick |

### Payload mínimo

```json
{
  "ok": true,
  "workspaceRunId": "wsrun_...",
  "workspaceId": "ws_...",
  "status": "running",
  "eventType": "workspace_run.updated",
  "timestamp": "2026-05-17T12:00:00.000Z",
  "miniActivityId": null,
  "runId": null,
  "projectId": null,
  "message": null
}
```

---

## Frontend

- Hook `useWorkspaceRunSse(workspaceId)` montado em `MissionRuntimeRoot`
- Ao receber evento: invalida `workspaceRuns`, `workspaceRunDetail`, `workspaceRunGit` (throttle 400ms)
- **Fallback:** botão **Atualizar** mantido; polling existente não removido
- Sem SSE / runtime offline: hook não conecta; UI mostra *Live updates disconnected*

---

## Validação

```bash
node --test scripts/daemon/lib/workspace-run-sse.test.js
npm run smoke:workspace-sse-phaseI
```

---

## Fora de escopo (Fase I)

- WebSocket, replay persistente, auth SSE, multi-tenant
- Redesign UI / toasts excessivos

---

## Próximo passo

Fase J sugerida: backoff/cap no sync + métricas de eventos SSE por workspace.
