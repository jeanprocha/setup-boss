# P0 — strategy_ready após approve

**Data:** 2026-05-16

## Objetivo

Eliminar estado falso de strategy “em progresso” após approve quando artefatos já estão prontos.

## Causa raiz

`run-strategy-runtime.js` gravava `run-context.json` com `phase3.status = "strategy_runtime_initialized"` no estado terminal. APIs e frontend interpretavam isso como `strategy_pending`.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `scripts/runtime/strategy-runtime/run-strategy-runtime.js` | Status terminal `strategy_ready`; idempotência aceita `strategy_ready` |
| `scripts/daemon/lib/run-clarification.js` | `isStrategyReadyOnDisk`; `mapPhase2` lê artifacts; refresh `snap` pós auto-start |
| `scripts/daemon/lib/run-strategy.js` | Normaliza `phase3Status` legado quando readiness+handoff prontos |
| `frontend/lib/runtime/strategy/strategy-state.ts` | `operationalReadiness=ready` → `strategy_ready` |
| `frontend/lib/runtime/strategy/strategy-auto-start-policy.ts` | `strategyAutoStartInProgress` false quando strategy pronta |
| `frontend/lib/runtime/observability/normalize-runtime-log-for-ui.ts` | `strategy_waiting_user_action` → noise (hint POST legado) |
| Testes novos/alterados | `run-strategy-runtime.test.js`, `run-clarification-strategy-ready.test.js`, `run-strategy.test.js`, `run-strategy-api-events.test.js`, `strategy-state.test.ts`, `strategy-auto-start-policy.test.ts`, `normalize-runtime-log-for-ui.test.ts` |

## Mapeamento antes / depois

| Condição | Antes | Depois |
|---|---|---|
| `phase3.status` após runtime | `strategy_runtime_initialized` | `strategy_ready` |
| Clarification API (artifacts prontos) | `strategy_pending` | `ready_for_execution` |
| Strategy API `phase3Status` (run legado) | `strategy_runtime_initialized` | `strategy_ready` (normalizado) |
| Frontend `mapPhase3` + `operationalReadiness=ready` | `strategy_pending` | `strategy_ready` |
| `strategyAutoStartInProgress` | `true` | `false` |

## Eventos inline approve

- `strategy_waiting_user_action` já não é emitido no código atual.
- `triggerStrategyRun` (via `autoStartStrategyAfterApproval`) emite `strategy_started` e `strategy_completed` — testado em `run-strategy-api-events.test.js`.

## Validações

```bash
node --test scripts/runtime/strategy-runtime/run-strategy-runtime.test.js \
  scripts/daemon/lib/run-clarification-strategy-ready.test.js \
  scripts/daemon/lib/run-strategy.test.js \
  scripts/daemon/lib/run-strategy-api-events.test.js

cd frontend && npx tsx --test \
  lib/runtime/strategy/strategy-state.test.ts \
  lib/runtime/strategy/strategy-auto-start-policy.test.ts \
  lib/runtime/observability/normalize-runtime-log-for-ui.test.ts
```

Run legado `20260516-163856-...`:
- `collectClarificationForRun` → `ready_for_execution`
- `collectStrategyForRun` → `phase3Status=strategy_ready`, `operationalReadiness=ready`

## Limitações restantes

- Runs antigos mantêm `phase3.status` intermediário em disco até re-run; leitura corrige via artifacts.
- Stall detection (P1) não implementado.
- Heartbeat/timeline fora de escopo.

## Próximos passos

- P1: stall timeout em `strategyAutoStartInProgress`.
- Validar E2E manual approve → UI sem spinner eterno.

## Riscos

- `operationalReadiness=ready` força `strategy_ready` mesmo com `phase3` ambíguo — intencional para este P0.
