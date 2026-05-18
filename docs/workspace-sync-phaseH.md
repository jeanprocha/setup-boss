# WorkspaceRun auto-sync — Fase H

**Data:** 2026-05-17  
**Pré-requisitos:** Fases A–G (workspace multi-projeto estável)

## Objetivo

Job daemon leve `workspace_run_sync` que monitora WorkspaceRuns ativos e faz **auto-advance** sequencial seguro, reutilizando o orquestrador existente.

## Configuração

| Variável | Default | Descrição |
|----------|---------|-----------|
| `SETUP_BOSS_WORKSPACE_SYNC_ENABLED` | `true` | `0`/`false` desliga o loop |
| `SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS` | `5000` | Intervalo entre ticks (mín. 1000) |

## Fluxo operacional

```mermaid
sequenceDiagram
  participant Loop as workspace_run_sync
  participant Lock as workspace-run-lock
  participant Rec as reconcile
  participant Orch as advanceWorkspaceRunOrchestration

  Loop->>Loop: tick (running + waiting_user_action)
  Loop->>Lock: por workspaceRunId
  Lock->>Rec: reconcile
  alt status waiting_user_action
    Rec-->>Loop: log waiting, sem advance
  else status running
    Rec->>Orch: advance
    Orch-->>Loop: completed / failed / waiting / próxima mini
  end
```

## Eventos / logs

- `workspace_run_sync.tick`
- `workspace_run_sync.advance`
- `workspace_run_sync.completed`
- `workspace_run_sync.waiting`
- `workspace_run_sync.failed`
- `workspace_run_sync.error`

Gravados em `daemon.log` e `events.jsonl` via `emitRuntimeEvent`.

## Estado exposto

`status.json` → `workspaceRunSync` (último tick, contagens) exposto em `GET /status` para a UI.

## Validação

```bash
npm run smoke:workspace-sync-phaseH
node --test scripts/daemon/lib/workspace-run-sync.test.js
```

## Limitações

- Sem paralelismo entre minis
- `waiting_user_action` não retoma sozinho — requer ação humana + `resume` manual
- Lock local por PID (single daemon)
- Poll fixo (sem backoff adaptativo)

## Próximo passo

SSE `workspace_run.*` para refresh da UI sem polling manual.
