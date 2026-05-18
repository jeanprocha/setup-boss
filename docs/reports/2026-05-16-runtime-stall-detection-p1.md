# P1 — Detecção visual de stall (strategy/execution)

**Data:** 2026-05-16  
**Escopo:** derivação UI apenas — sem alterar runtime, API, polling, Git ou fluxo approve/strategy P0.

## Lógica implementada

Utilitário isolado `deriveRuntimeStallVisual()` calcula, a partir de eventos já disponíveis na UI:

- `lastMeaningfulEventAt` — último evento significativo ou `phaseBumpAtMs` (mudança de `runtimePhase` detectada no hook);
- `msSinceLastMeaningful` — relógio local (`nowMs` − último significativo);
- `level` — `normal` | `warning` | `stalled` | `critical`;
- `message` — texto graduado para o utilizador;
- `suppressed` — quando não deve mostrar aviso.

**Eventos significativos:** `strategy_started`, `strategy_completed`, `execution_started`, `execution_progress`, `execution_completed`, `correction_started`, `review_started`, `review_completed`, variantes `runtime.*` / `strategy_*` alinhadas, `phase_started` / `phase_completed` / `phase_failed`, erros/avisos (`severity` warn/error), mudança de fase em payload.

**Ruído ignorado:** `scheduler_tick`, `worker_idle`, `worker_busy`, `maintenance_*`, `strategy_waiting_user_action`, tier `noise`/`technical` do classificador existente (excepto tipos explícitos da lista acima).

**Supressão (sem aviso):**

- `activelyProcessing === false`;
- `strategy_ready` / `ready_for_execution`;
- run terminal (`success`, `failed`, `recovered`, `execution_completed`, …);
- worker idle sem job para o run (`runningJobsCount === 0` e `currentJobId` ausente ou ≠ `runKey`).

Nada é persistido no run — só derivação visual.

## Thresholds

| Tempo sem evento significativo | Nível     | Mensagem UI |
|-------------------------------|-----------|-------------|
| &lt; 60s                      | `normal`  | — |
| ≥ 60s                         | `warning` | Sem novos eventos há X min. |
| ≥ 5 min                       | `stalled` | Esta etapa está demorando mais que o normal. |
| ≥ 10 min                      | `critical`| Nenhum progresso recente detectado. Verifique o daemon/runtime. |

Constantes exportadas: `STALL_WARNING_MS`, `STALL_STALLED_MS`, `STALL_CRITICAL_MS`.

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/runtime/observability/derive-runtime-stall-visual.ts` | **Novo** — derivação pura |
| `frontend/lib/runtime/observability/derive-runtime-stall-visual.test.ts` | **Novo** — 9 testes |
| `frontend/hooks/use-runtime-stall-visual.ts` | **Novo** — hook com tick 1s + bump de fase |
| `frontend/hooks/use-strategy-phase-progress.ts` | Delega stall ao utilitário |
| `frontend/components/features/strategy/StrategyStageHero.tsx` | Passa `runtimePhase`, `strategyReady`, `runKey` |
| `frontend/components/features/execution/ExecutionPanel.tsx` | Usa hook na fase `*_running` |
| `frontend/components/features/execution/ExecutionProgressCard.tsx` | Exibe `stallMessage` |

## Validações

### Automáticas

```bash
cd frontend
npx tsx --test lib/runtime/observability/derive-runtime-stall-visual.test.ts
```

Cobertura: thresholds, transições, ruído ignorado, `strategy_ready` suprimido, terminal suprimido, worker idle suprimido, `phaseBumpAtMs`.

### Manuais (checklist)

| Cenário | Esperado |
|---------|----------|
| Strategy longa sem SSE novo | `warning` → `stalled` → `critical` no hero |
| Daemon parado durante processing | `critical` com menção ao daemon |
| Worker idle / sem job activo | Sem aviso |
| Run concluído (`success`) | Sem aviso |
| Strategy ready (artefactos OK) | Sem aviso |
| Novo evento significativo | Volta a `normal` |

## Limitações restantes

- `runningJobsCount` / `currentJobId` não estão no contrato frontend actual — supressão por worker idle depende de valores opcionais futuros ou heurística via eventos;
- detecção baseia-se no relógio do browser (tick 1s), não no relógio do daemon;
- fases sem eventos na lista (ex. alguns sub-eventos de decomposição) podem não repor `lastMeaningful` até aparecer evento classificado;
- áreas fora de `StrategyStageHero` / `ExecutionProgressCard` não mostram o aviso (timeline central inalterada, conforme escopo).
