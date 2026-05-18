# Web UI — Recovery e Rehydration

Comportamento após restart do daemon ou perda temporária de SSE.

---

## Boot do daemon

1. `recovery_started` (SSE global)
2. Scan jobs `run_execute` activos + índices de runs com orchestration activa
3. `syncOrchestrationFromArtifacts` (modo rehydrate — sem spam de eventos)
4. `classifyRunRecovery` → persistência `recovery_status` / `recovery_reasons`
5. Eventos por run: `runtime_recovered` | `runtime_stale` | `runtime_orphaned`
6. `recovery_completed`

---

## Classificação

| Status | Significado |
|--------|-------------|
| `recovered` | Coerente após restart |
| `stale` | Incoerência operacional (orch activa sem worker, etc.) |
| `orphaned` | Orchestration activa + lifecycle terminal |
| `recovery_pending` | Ainda a reconciliar |

Marcadores **não** matam jobs automaticamente — operador decide.

---

## API

```http
GET /runtime/recovery
```

Snapshot de runs activas + summary.

```http
GET /runs/:id/orchestration
```

Inclui `recoveryStatus`, `recoveryReasons` no bootstrap.

---

## Frontend

| Peça | Função |
|------|--------|
| `useRuntimeRecovery` | Poll snapshot 8s (SSE connected) |
| `resyncRuntimeAfterReconnect` | Após SSE reconnect: recovery + invalidate execution/evidence |
| `RecoveryStatusBadge` | Visualização no banner |
| `runtime-recovery-live-sync` | Invalidação rápida em eventos recovery |

Throttle resync: mínimo **2s** entre resyncs (anti-storm).

---

## SSE reconnect

`useRuntimeSse` → `onConnected` com `reconnectAttempt > 0` → resync.

`runtime-event-bus`: eventos recovery → invalidação **120ms**; outros → **750ms** (dedup por key).

---

## Validação

- `node --test scripts/daemon/lib/run-runtime-rehydration.test.js`
- `npm run smoke:mvp-web-ui-e2e` (restart daemon + `GET /runtime/recovery`)

---

## Pendências conhecidas

- POST `/runs/:id/recovery/reconcile` para fecho controlado de stale (não no MVP 5.17).
- Limpar `recovery_status` após operador fechar run stale manualmente.
