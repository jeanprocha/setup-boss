# Runtime UX Polish — Phase UX-E

## Objetivo

Reduzir ruído e duplicidade visual na UX operacional do Mission Control (fases UX-A–UX-D), mantendo observabilidade técnica intacta no painel Debug.

## Princípios

- **Uma timeline dominante:** `ExecutionTimelineView` + `ActiveStepBanner` no card operacional central.
- **Um estado ativo dominante:** banner UX-B com prioridade failed → completed → waiting → stalled → running.
- **Feed humano limpo:** `RuntimeActivityFeed` sem ticks, heartbeats, sync ou payloads grandes.
- **Debug preservado:** `TechnicalDebugConsole` continua com todos os eventos.

## Alterações de layout (`RunViewShell`)

| Antes | Depois |
|-------|--------|
| `ProjectRunWorkflowStatusStrip` + banner + timeline + `CentralExecutionTimeline` aberto | Card único: banner + timeline; `CentralExecutionTimeline` dentro de `OperationalDetailCollapse` (recolhido por defeito) |

## Módulos novos / alterados

| Módulo | Caminho |
|--------|---------|
| Humanização de copy | `frontend/lib/runtime/ux/humanize-runtime-copy.ts` |
| Colapso detalhe técnico | `frontend/components/features/run-detail/OperationalDetailCollapse.tsx` |
| Classificação (noise) | `frontend/lib/runtime/ux/classify-runtime-event-visibility.ts` |
| Feed | `frontend/lib/runtime/ux/build-runtime-activity-feed.ts` |
| Normalização | `frontend/lib/runtime/ux/normalize-runtime-event.ts` |
| Timeline checkpoints | `frontend/lib/runtime/ux/derive-execution-timeline.ts` |
| Estado dominante | `frontend/lib/runtime/ux/derive-run-ux-state.ts` |

## Noise reduction (feed humano)

Ocultos (`hidden`): `workspace_run_sync.*`, `scheduler_tick`, `worker_idle`, `heartbeat`, `stream-*`, `job_*` de fila, etc.

Técnicos (`technical`, só no Debug): `runtime.output_dir_resolved`, `governance*`, `clarification_initialized`, payloads > 12 KB.

## Estados vazios (feed)

Mensagens contextuais conforme runtime offline, SSE desligado, corrida recente ou espera de ação humana (`observability.activityFeedEmpty*`).

## Testes

```bash
node --experimental-strip-types --test frontend/lib/runtime/ux/*.test.ts
```

50 testes (inclui `humanize-runtime-copy.test.ts`).

## Fora de escopo

Replay persistente, SSE novo, workspace UX completa, filtros avançados, redesign completo.
