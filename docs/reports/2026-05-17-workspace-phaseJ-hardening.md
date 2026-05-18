# Relatório: Workspace Fase J — Hardening operacional do sync

**Data:** 2026-05-17  
**Tipo:** implementação incremental (append-only)

---

## Resumo

Hardening do `workspace_run_sync` e observabilidade SSE: cap por tick, backoff idle, métricas em `/status`, indicador realtime unificado na UI, logs padronizados e isolamento de falhas por run.

---

## Métricas adicionadas (`GET /status` → `workspaceRunSync`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `enabled` | boolean | Sync ativo |
| `intervalMs` | number | Intervalo base |
| `effectiveIntervalMs` | number | Intervalo do próximo tick |
| `cap` | number | Cap configurado |
| `activeRuns` | number | Runs elegíveis no tick |
| `processedLastTick` | number | Processados no último tick |
| `skippedByCapLastTick` | number | Adiados por cap |
| `lastTickAt` | string \| null | ISO último tick |
| `lastDurationMs` | number | Duração último tick (ms) |
| `totalTicks` | number | Ticks no processo |
| `totalAdvanced` | number | Avanços com outcome |
| `totalCompleted` | number | Conclusões via sync |
| `totalFailed` | number | Falhas via sync |
| `totalErrors` | number | Erros (advance/throw) |
| `sseConnectedClients` | number | Clientes no stream SSE |
| `sseEventsEmitted` | number | Eventos escritos (sem heartbeat) |

---

## Configs novas

| Variável | Default |
|----------|---------|
| `SETUP_BOSS_WORKSPACE_SYNC_CAP` | `10` |
| `SETUP_BOSS_WORKSPACE_SYNC_IDLE_MAX_INTERVAL_MS` | `60000` |
| `SETUP_BOSS_WORKSPACE_SYNC_ONE_TIMEOUT_MS` | `120000` |

Existentes reutilizadas: `SETUP_BOSS_WORKSPACE_SYNC_ENABLED`, `SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS`.

---

## Comportamento de cap

- Ordenação: `running` → `waiting_user_action`, depois `updatedAt` asc, desempate `workspaceRunId`.
- Slice até `cap`; restantes reportados em `skippedByCapLastTick`.
- Próximo tick processa os adiados (ordem estável mantida).

---

## Comportamento de backoff

- Sem runs ativos: após cada tick, `effectiveIntervalMs = min(base × 2^idleStreak, idleMax)`.
- Com runs ativos: `idleStreak = 0`, intervalo = base.
- `resetWorkspaceRunSyncBackoff()` em `POST .../start` e `POST .../resume`.
- Scheduler: `setTimeout` encadeado (substitui `setInterval` fixo).

---

## Observabilidade SSE

- Módulo `sse-observability.js`: `connectedClients`, `eventsEmitted`.
- Registo em connect/disconnect do stream (`runtime-api.js`).
- Contagem de eventos em `writeSseEvent` (exclui `heartbeat`).
- Log `workspace_run_sse.clients` em mudança de clientes.
- Métricas fundidas em `/status` (live + disco).

---

## UI

- `computeUnifiedRealtimePhase` — combina `useRuntimeSseStore` + `useWorkspaceRunSseStore`.
- Badge no `WorkspaceRunViewShell`: **Realtime connected / degraded / disconnected**.

---

## Validações executadas

```bash
node --test scripts/daemon/lib/workspace-run-sync.test.js scripts/daemon/lib/sse-observability.test.js
npm run smoke:workspace-sync-phaseJ
```

Cobertura:

| Cenário | Resultado |
|---------|-----------|
| Cap respeitado (2/3 runs) | OK (unit) |
| Backoff sobe em idle / reseta com run ativo | OK (unit) |
| Erro num run não bloqueia o outro | OK (unit) |
| Ordenação running + updatedAt | OK (unit) |
| Métricas SSE register/unregister | OK (unit) |
| `/status` com workspaceRunSync | OK (smoke) |
| Loop start/stop | OK (smoke) |

---

## Limitações

- Métricas cumulativas só no processo do daemon (não persistidas entre restarts).
- Backoff e cap são single-process; sem coordenação multi-node.
- `sseEventsEmitted` conta escritas no wire (por cliente para eventos entregues).
- Timeout por run aborta a promise; run pode ficar parcialmente reconciliado até ao próximo tick.

---

## Riscos

| Risco | Mitigação atual |
|-------|-----------------|
| Cap atrasa runs em pico | Ordenação prioriza `running`; cap configurável |
| Backoff atrasa deteção de novo run idle | Reset em start/resume |
| Muitos clientes SSE | Contador em `/status`; sem limite hard ainda |
| Tick longo com N runs × timeout | Cap + timeout individual |

---

## Readiness operacional (atualizado)

| Área | Estado |
|------|--------|
| Auto-sync workspace | **Operacional** com cap e backoff |
| Métricas daemon | **Parcial** — `/status` rico; sem histórico |
| SSE realtime UI | **Operacional** — indicador unificado |
| Mission Control multi-projeto | **Beta operacional** |
| Produção multi-tenant | **Não pronto** |

**Gargalos restantes**

1. Sem persistência de métricas / alertas.
2. Sem limite de clientes SSE.
3. HITL ainda manual (sem auto-resume).
4. Single-node locks.

**O que ainda impede produção real**

- Auth/isolamento multi-tenant no runtime API e SSE.
- HA / fila distribuída / locks partilhados.
- SLOs, alertas e runbooks automatizados.
- Testes de carga com dezenas de WorkspaceRuns paralelos.

---

## Próximo passo recomendado

**Fase K (sugerida):** export leve de métricas (ficheiro rotativo ou endpoint `/metrics` Prometheus-friendly), limite soft de clientes SSE, e painel operacional mínimo no Mission Control (sem redesign).

---

## Arquivos principais

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/lib/workspace-run-sync.js` | Cap, backoff, métricas, timeout |
| `scripts/daemon/lib/sse-observability.js` | Novo |
| `scripts/daemon/runtime-api.js` | SSE metrics, reset backoff, status merge |
| `frontend/lib/workspace/realtime/unified-realtime-status.ts` | Novo |
| `frontend/hooks/use-unified-realtime-status.ts` | Novo |
| `frontend/components/features/workspace/WorkspaceRunViewShell.tsx` | Badge unificado |
| `docs/workspace-sync-hardening-phaseJ.md` | Novo |
