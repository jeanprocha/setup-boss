# Mission Control — hardening operacional P1

**Data:** 2026-05-16  
**Escopo:** estabilização final para uso diário — coerência runtime/frontend, SSE/reconnect, refresh/reopen, terminais, dedupe. Sem features novas, redesign, Git ou alteração da arquitectura runtime.

---

## Inconsistências encontradas

| # | Área | Problema |
|---|------|----------|
| 1 | Fonte de verdade | Flags de processing/stall/terminal espalhadas em hero, execution, stall hook e policy — risco de contradição (`worker idle` + `em progresso`) |
| 2 | SSE reconnect | Primeira ligação / refresh com buffer live vazio não disparava `resyncRuntimeAfterReconnect` |
| 3 | Refresh/reopen | Recovery `reachable` não refetchava o run já seleccionado (só troca de `runKey`) |
| 4 | Dedupe live store | `getMerged` deduplicava só por `id`; poll+SSE podiam duplicar antes do merge final |
| 5 | Execution active | `execution_running` ignorava `currentRunId` ≠ run e estados terminais do summary |

---

## Correções aplicadas

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/runtime/observability/derive-run-operational-coherence.ts` | **Novo** — SSOT: `showStrategyProcessing`, `showExecutionProcessing`, `suppressStall`, `isRunTerminal`, heartbeat alinhado |
| `frontend/hooks/use-run-operational-coherence.ts` | **Novo** — hook React sobre a derivação |
| `frontend/lib/runtime/observability/derive-run-operational-coherence.test.ts` | **Novo** — 3 testes |
| `frontend/components/features/strategy/StrategyStageHero.tsx` | Processing via `deriveRunOperationalCoherence` |
| `frontend/components/features/execution/ExecutionPanel.tsx` | `executionActive` via coerência (terminal + worker) |
| `frontend/hooks/use-runtime-sse.ts` | Resync também quando buffer live vazio (refresh/reconnect inicial) |
| `frontend/hooks/use-run-selection-resync.ts` | Refetch em troca de run **ou** recovery `reachable` |
| `frontend/stores/runtime-live-events-store.ts` | `getMerged` aplica `dedupeRuntimeEvents` |

*Mantidos do polish anterior:* dedupe em `use-run-events`, poll→live, connection recovery, heartbeat badge offline, timeline títulos/terminais.

---

## Cenários validados

| Cenário | Método | Resultado |
|---------|--------|-----------|
| Run terminal `success` | Teste coerência | Sem strategy processing; `suppressStall` |
| `strategy_ready` + readiness | Teste coerência | Sem spinner; `isStrategyReady` |
| Worker busy noutro run | Teste coerência | `showExecutionProcessing=false` |
| Dedupe SSE+poll | Testes dedupe + live store | Chave estável; 39 testes OK |
| Timeline / stall / logs | Regressão unitária | 0 falhas |
| SSE reconnect (código) | `liveEmpty` → resync | Read models refetch |
| Refresh página | `liveEmpty` + selection resync | Poll repovoa + refetch run |
| Daemon offline→online | `useRuntimeConnectionRecovery` + selection resync recovered | Heartbeat + run refetch |
| Run legado strategy_ready | Coerência + polish anterior | Sem auto-start / sem processing falso |

### Testes

```bash
cd frontend
npx tsx --test \
  lib/runtime/observability/derive-run-operational-coherence.test.ts \
  lib/runtime/observability/dedupe-runtime-events.test.ts \
  lib/runtime/observability/is-ui-processing.test.ts \
  lib/runtime/observability/derive-run-operational-timeline.test.ts \
  lib/runtime/observability/derive-runtime-stall-visual.test.ts \
  lib/runtime/observability/derive-runtime-operational-context.test.ts \
  lib/runtime/observability/normalize-runtime-log-for-ui.test.ts
```

**39 testes — 0 falhas.**

---

## Comportamento após reconnect / restart

| Evento | Comportamento esperado |
|--------|------------------------|
| Daemon parado | Badge offline; heartbeat/stall coerentes; poll desactivado |
| Daemon restart | `reachable` true → invalidate heartbeat + refetch run activo; SSE reconecta |
| SSE reconnect | `seenKeys` evita duplicar eventos; resync se buffer vazio ou reconnect; sem reactivar spinner terminal |
| Refresh (F5) | Buffer live vazio → resync no `onConnected`; selection resync refetch strategy/execution/observability |
| Reopen outro run | `useRunSelectionResync` refetch imediato |
| Run concluído + worker idle | Coerência: sem processing, sem stall, sem badge “Em andamento” no hero |

---

## Limitações restantes

1. Timeline vazia em runs legados sem eventos persistidos no runtime.  
2. Latência heartbeat ~12s após restart do daemon.  
3. Re-clicar o **mesmo** run na lista não força refetch (só troca de run ou recovery).  
4. Stores em memória (live/daemon logs) perdem histórico no F5 — mitigado por poll + observability.  
5. Smoke browser E2E intake→review não executado nesta sessão.

---

## Avaliação final — estabilidade operacional

| Dimensão | Nota | Comentário |
|----------|------|------------|
| SSOT run (phase/readiness/worker/UI) | **Bom** | `deriveRunOperationalCoherence` centraliza flags |
| SSE + poll + dedupe | **Bom** | Três camadas: bus SSE, live dedupe, merge final |
| Refresh / reopen / recovery | **Bom** | Resync inicial + recovery refetch |
| Terminais (success/ready/failed) | **Bom** | Hero + execution + stall alinhados |
| Timeline / logs | **Aceitável** | Robusto em testes; legado esparso |
| Uso diário Setup Boss | **Pronto** | Base operacional estável com limitações conhecidas |

**Conclusão:** o Mission Control está endurecido para operação diária. A coerência entre runtime, polling, SSE, heartbeat, strategy/execution e painéis passa por uma derivação única; reconnect e refresh recompõem estado sem spinner/stall fantasma. Recomenda-se smoke manual curto: daemon stop/start → reopen run `20260516-163856-…` sem F5.
