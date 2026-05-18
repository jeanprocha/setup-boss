# Mission Control — polish P1 pós-validação integrada

**Data:** 2026-05-16  
**Escopo:** fechar inconsistências residuais de UX operacional (refresh/reopen, dedupe, estados conflitantes, daemon recovery, timeline/logs, terminais). Sem redesign nem refactor estrutural.

---

## Inconsistências encontradas

| # | Área | Problema |
|---|------|----------|
| 1 | Refresh/reopen | Poll de eventos não alimentava o buffer live; reopen não refetchava strategy/clarification/execution de forma coordenada |
| 2 | Dedupe | Merge SSE + poll + audit podia duplicar o mesmo marco com ids diferentes |
| 3 | Status visual | Hero strategy podia manter “Em andamento” com `runState=success` ou `strategy_ready` se flags locais divergissem |
| 4 | Daemon offline | Badge sumia (`null`) entre erro e próximo poll; recovery não invalidava heartbeat |
| 5 | Timeline | Títulos genéricos (“Evento do runtime”); status “Em progresso” residual; último progresso incluía terminais |
| 6 | Recovery | `resyncRuntimeAfterReconnect` não refetchava strategy/clarification/observability/heartbeat |

---

## Correções aplicadas

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/runtime/observability/dedupe-runtime-events.ts` | **Novo** — dedupe por `runtimeLogDedupeKey` |
| `frontend/lib/runtime/observability/is-ui-processing.ts` | **Novo** — `shouldShowStrategyProcessingUi()` |
| `frontend/hooks/use-run-events.ts` | Dedupe no merge final |
| `frontend/hooks/use-runtime-events.ts` | Ingestão poll → `runtime-live-events-store` |
| `frontend/hooks/use-runtime-connection-recovery.ts` | **Novo** — invalidate/refetch ao voltar `reachable` |
| `frontend/hooks/use-run-selection-resync.ts` | **Novo** — refetch ao trocar run |
| `frontend/components/features/MissionRuntimeRoot.tsx` | Monta `useRuntimeConnectionRecovery` |
| `frontend/components/features/run-detail/RunViewShell.tsx` | Monta `useRunSelectionResync` |
| `frontend/components/features/strategy/StrategyStageHero.tsx` | Processing via `shouldShowStrategyProcessingUi` |
| `frontend/hooks/use-strategy-phase-progress.ts` | Stall só com `processing` activo; passa `runState` |
| `frontend/lib/runtime/orchestration/runtime-resync.ts` | + heartbeat, strategy, clarification, observability |
| `frontend/lib/runtime/observability/derive-run-operational-timeline.ts` | Títulos, status terminal, último progresso |
| `frontend/components/features/observability/RuntimeOperationalHeartbeatBadge.tsx` | Offline quando `!reachable` ou `daemonAlive=false` |

---

## Cenários validados

| Cenário | Validação |
|---------|-----------|
| Dedupe eventos (id repetido) | Teste unitário `dedupe-runtime-events` |
| Strategy processing suprimido (ready / success) | Teste `is-ui-processing` |
| Timeline `strategy_completed` + status `completed` | Teste timeline |
| Stall / heartbeat / logs normalizados | Regressão — 36 testes passaram |
| Recovery reachable | Hook invalida heartbeat + read models do run |
| Reopen run | Hook refetch strategy/clarification/execution/observability |
| SSE reconnect | `runtime-resync` alinhado com recovery hook |

### Comandos

```bash
cd frontend
npx tsx --test \
  lib/runtime/observability/dedupe-runtime-events.test.ts \
  lib/runtime/observability/is-ui-processing.test.ts \
  lib/runtime/observability/derive-run-operational-timeline.test.ts \
  lib/runtime/observability/derive-runtime-stall-visual.test.ts \
  lib/runtime/observability/derive-runtime-operational-context.test.ts \
  lib/runtime/observability/normalize-runtime-log-for-ui.test.ts
```

**Resultado:** 36 testes — **0 falhas**.

---

## Regressões evitadas

- Dedupe por `id` SSE mantido; chave lógica só quando ids diferem.
- Stall thresholds e supressões P1 inalterados (só reforço `runState` + `processing`).
- Timeline estrutural (groups, fontes, aba Logs) intacta.
- Logs: classificação `important`/`noise` e cap de payload não alterados.

---

## Comportamento antes / depois

| Situação | Antes | Depois |
|----------|-------|--------|
| Refresh com poll activo | Só query cache; live buffer vazio até SSE | Poll repovoa live store |
| Reopen run | staleTime podia atrasar strategy/execution | Refetch imediato dos read models |
| Runtime offline → online | Heartbeat podia ficar desactualizado | Invalidate + refetch automático |
| Hero strategy + run `success` | Possível spinner se flags locais erradas | Suprimido por `shouldShowStrategyProcessingUi` |
| Badge heartbeat | `null` em loading/offline intermédio | “Daemon offline” estável quando unreachable |
| Timeline após `strategy_completed` | Título genérico; progresso stale | “Estratégia concluída”; status `completed` |

---

## Limitações restantes

1. Runs legados sem eventos persistidos continuam com timeline vazia.  
2. Latência heartbeat ~12s após restart do daemon.  
3. Re-seleccionar o **mesmo** run na lista não dispara refetch (só troca de `runKey`).  
4. Smoke visual browser do fluxo intake→review não repetido nesta sessão.  
5. Stores in-memory (live events, daemon logs) perdem histórico no refresh completo da página — mitigado por poll + observability refetch.

---

## Avaliação final — estabilidade operacional

| Dimensão | Nota |
|----------|------|
| Refresh / reopen | **Bom** — resync + dedupe + poll→live |
| Coerência visual global | **Bom** — processing/stall/terminal alinhados |
| Daemon offline / recovery | **Bom** — badge + invalidate sem reload manual |
| Timeline / logs | **Aceitável** — polish de títulos/progresso; legado ainda esparso |

**Conclusão:** polish P1 fecha os gaps residuais da validação integrada com mudanças pequenas e testáveis. A UX operacional está **estável para uso diário**; recomenda-se smoke manual rápido: offline daemon → restart → reopen run legado sem F5.
