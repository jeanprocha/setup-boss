# Workspace Fase J — Hardening operacional do `workspace_run_sync`

**Data:** 2026-05-17  
**Objetivo:** robustez operacional e controlo de carga sem alterar a arquitetura principal.

---

## Configuração

| Variável | Default | Descrição |
|----------|---------|-----------|
| `SETUP_BOSS_WORKSPACE_SYNC_ENABLED` | `1` | Liga/desliga auto-sync |
| `SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS` | `5000` | Intervalo base entre ticks |
| `SETUP_BOSS_WORKSPACE_SYNC_CAP` | `10` | Máx. WorkspaceRuns processados por tick |
| `SETUP_BOSS_WORKSPACE_SYNC_IDLE_MAX_INTERVAL_MS` | `60000` | Teto do backoff em idle |
| `SETUP_BOSS_WORKSPACE_SYNC_ONE_TIMEOUT_MS` | `120000` | Timeout por sync individual |

---

## Sync cap

- Cada tick processa no máximo **N** runs (`SETUP_BOSS_WORKSPACE_SYNC_CAP`).
- Ordenação estável antes do slice:
  1. `running` antes de `waiting_user_action`
  2. `updatedAt` ascendente
  3. `workspaceRunId` (desempate)
- Runs excedentes ficam para o tick seguinte (`skippedByCapLastTick`).

---

## Backoff adaptativo

- **Runs ativos:** intervalo = base (`SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS`).
- **Sem runs ativos:** `effectiveIntervalMs = min(base × 2^idleStreak, idleMax)` após cada tick idle.
- **Reset:** `POST /workspace-runs/.../start|resume` chama `resetWorkspaceRunSyncBackoff()`.
- Scheduler: `setTimeout` encadeado (sem fila complexa).

---

## Métricas (`GET /status` → `workspaceRunSync`)

| Campo | Significado |
|-------|-------------|
| `enabled` | Sync ligado |
| `intervalMs` | Intervalo base |
| `effectiveIntervalMs` | Intervalo do próximo tick |
| `cap` | Cap configurado |
| `activeRuns` | Runs em `running` ou `waiting_user_action` |
| `processedLastTick` | Processados no último tick |
| `skippedByCapLastTick` | Ignorados por cap |
| `lastTickAt` | ISO do último tick |
| `lastDurationMs` | Duração do último tick |
| `totalTicks` | Ticks acumulados (processo) |
| `totalAdvanced` | Avanços com outcome |
| `totalCompleted` / `totalFailed` / `totalErrors` | Contadores cumulativos |
| `sseConnectedClients` | Clientes em `GET /events/stream` |
| `sseEventsEmitted` | Eventos SSE escritos (exc. heartbeat) |

---

## SSE observabilidade

- `scripts/daemon/lib/sse-observability.js` — contadores em memória.
- Log: `workspace_run_sse.clients` em connect/disconnect.
- Eventos contados em `writeSseEvent` (wire), exceto `heartbeat`.

---

## UI

- Indicador unificado no header do WorkspaceRun:
  - **Realtime connected**
  - **Realtime degraded**
  - **Realtime disconnected**
- Considera SSE de **projeto** (`runtime_event`) e **workspace** (`workspace_run.*`).

---

## Logs padronizados

| Evento | Quando |
|--------|--------|
| `workspace_run_sync.tick` | Início do tick |
| `workspace_run_sync.summary` | Fim do tick |
| `workspace_run_sync.backoff` | Mudança de intervalo idle |
| `workspace_run_sse.clients` | Connect/disconnect stream |

---

## Recovery

- Exceção num run: isolada; tick continua; `processedLastTick` inclui a tentativa.
- Timeout por run via `SETUP_BOSS_WORKSPACE_SYNC_ONE_TIMEOUT_MS`.
- Tick não bloqueia indefinidamente (timeout + cap).

---

## Validação

```bash
node --test scripts/daemon/lib/workspace-run-sync.test.js scripts/daemon/lib/sse-observability.test.js
npm run smoke:workspace-sync-phaseJ
```

---

## Fora de escopo

- Multi-node / Redis / WebSocket / replay persistente
- Redesign UI / auto-resume HITL

---

## Próximo passo sugerido

Fase K: persistência leve de métricas + alertas operacionais (sem stack distribuída).
