# Runtime Activity Feed + Debug Console — Phase UX-D

## Objetivo

Separar eventos **operacionais** (feed humano) de **técnicos** (consola debug), sem alterar backend/SSE.

## Classificação

`frontend/lib/runtime/ux/classify-runtime-event-visibility.ts`

| Visibilidade | Uso |
|--------------|-----|
| `operational` | RuntimeActivityFeed |
| `technical` | Debug (via logs existentes) |
| `hidden` | Oculto do feed; ainda no runtime |

## UI

| Componente | Painel Observabilidade |
|------------|---------------------|
| `RuntimeActivityFeed` | Tab **Atividade** |
| `TechnicalDebugConsole` | Tab **Debug técnico** (logs + diagnóstico técnico) |

Timeline UX-C (centro) e `ActiveStepBanner` (UX-B) inalterados.

## Noise reduction (feed)

Ocultos do feed: `worker_idle`, `workspace_run_sync.tick/summary`, `scheduler_tick`, payloads >12KB, `clarification_initialized`, `runtime.output_dir_resolved`, etc.

## Expansão

Cada item do feed: `[+]` → JSON truncado (8KB) do `raw` event.

## Testes

```bash
node --experimental-strip-types --test frontend/lib/runtime/ux/classify-runtime-event-visibility.test.ts frontend/lib/runtime/ux/build-runtime-activity-feed.test.ts
```
