# P1 — Heartbeat operacional daemon/worker

**Data:** 2026-05-16  
**Escopo:** diagnóstico mínimo para UI + precisão do stall visual (P1 anterior). Sem métricas complexas, sem websocket novo, sem alterar fluxo approve/strategy P0.

## Contrato heartbeat

**`GET /runtime/heartbeat`** → `{ ok: true, data: RuntimeHeartbeatDto }`

| Campo | Tipo | Origem |
|-------|------|--------|
| `daemonAlive` | boolean | snapshot daemon `running` |
| `runningJobsCount` | number | `status.json` / fila `running` |
| `currentJobId` | string \| null | snapshot / `worker.currentJobId` |
| `currentRunId` | string \| null | job na fila (`metadata.executionRunId` / `runId`) |
| `lastRuntimeActivityAt` | ISO \| null | max(`updatedAt`, `lastPipelineEventAt`, heartbeats de jobs) |
| `workerState` | `"idle"` \| `"busy"` | busy se snapshot/fila activa |
| `queueSize` | number | `pending + running` na fila |
| `daemonStartedAt` | ISO \| null | `snap.startedAt` / disco |
| `updatedAt` | ISO | momento da resposta |

## Derivação frontend

**`deriveRuntimeOperationalContext()`** →

| Campo | Valores |
|-------|---------|
| `runtimeHealth` | `online` \| `offline` \| `unknown` |
| `workerState` | `idle` \| `busy` \| `unknown` |
| `isRunActivelyProcessing` | UI activo **e** (`currentRunId === runKey` ou fallback sem heartbeat) |
| `workerIdleNoJob` | idle + sem jobs + sem `currentJobId` |

**Integração stall (`deriveRuntimeStallVisual`):**

- suprime aviso se worker idle sem job ou `currentRunId` ≠ run actual;
- `daemonAlive === false` → mensagem **"Daemon offline ou sem resposta."** (nível `critical`);
- worker idle não atinge `stalled`/`critical` (cap + supressão);
- fallback sem heartbeat: comportamento anterior (só sinal UI).

**Hook:** `useRuntimeHeartbeat()` — poll ~12s (mesma política que health).

**UI mínima:** `RuntimeOperationalHeartbeatBadge` no painel técnico de observabilidade — badges "Daemon online/offline" e "Worker idle/busy".

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/lib/runtime-heartbeat.js` | **Novo** — builder |
| `scripts/daemon/lib/runtime-heartbeat.test.js` | **Novo** — 4 testes |
| `scripts/daemon/runtime-api.js` | `GET /runtime/heartbeat` + CORS OPTIONS |
| `scripts/daemon/runtime-api.test.js` | assert endpoint |
| `frontend/lib/api/runtime-types.ts` | `RuntimeHeartbeatDto` |
| `frontend/lib/api/runtime-api.ts` | `fetchRuntimeHeartbeat` |
| `frontend/lib/api/query-keys.ts` | `heartbeat` key |
| `frontend/hooks/use-runtime-heartbeat.ts` | **Novo** |
| `frontend/lib/runtime/observability/derive-runtime-operational-context.ts` | **Novo** |
| `frontend/lib/runtime/observability/derive-runtime-operational-context.test.ts` | **Novo** — 5 testes |
| `frontend/lib/runtime/observability/derive-runtime-stall-visual.ts` | heartbeat + daemon offline + cap idle |
| `frontend/lib/runtime/observability/derive-runtime-stall-visual.test.ts` | +3 cenários |
| `frontend/hooks/use-runtime-stall-visual.ts` | consome heartbeat |
| `frontend/hooks/use-strategy-phase-progress.ts` | stall via operational context |
| `frontend/components/features/execution/ExecutionPanel.tsx` | `uiActivelyProcessing` |
| `frontend/components/features/observability/RuntimeOperationalHeartbeatBadge.tsx` | **Novo** |
| `frontend/components/features/observability/RuntimeObservabilityTechnical.tsx` | badge no painel |

## Validações

### Automáticas

```bash
node --test scripts/daemon/lib/runtime-heartbeat.test.js
cd frontend
npx tsx --test lib/runtime/observability/derive-runtime-operational-context.test.ts lib/runtime/observability/derive-runtime-stall-visual.test.ts
```

### Manuais (checklist)

| Cenário | Esperado |
|---------|----------|
| Daemon parado | badge "Daemon offline"; stall → mensagem offline |
| Daemon reiniciado | heartbeat volta `daemonAlive: true` |
| Worker a executar outro run | sem stall no run inactivo na UI |
| Run concluído | supressão de stall |
| SSE parado + worker busy no run | warning/stalled possível |
| Runtime offline (proxy) | heartbeat desactivado; fallback UI |

## Limitações restantes

- `currentRunId` depende de `runId`/`metadata` no job — jobs legados sem run podem deixar `currentRunId` null mesmo com worker busy;
- heartbeat não substitui SSE — só melhora diagnóstico e supressão de falso stall;
- poll 12s: mudança worker idle/busy pode ter latência até ao próximo tick;
- badge só no painel técnico de observabilidade (sem redesign do hero strategy/execution).
