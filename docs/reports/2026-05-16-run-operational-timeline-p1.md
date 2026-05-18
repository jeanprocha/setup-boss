# P1 — Timeline operacional do run

**Data:** 2026-05-16  
**Escopo:** timeline humana resumida por run — sem event sourcing, websocket novo, ou substituir logs técnicos.

## Modelo timeline

### Item (`OperationalTimelineItem`)

| Campo | Descrição |
|-------|-----------|
| `id` | Chave estável (`runtimeLogDedupeKey`) |
| `timestamp` | ISO 8601 |
| `title` | Rótulo curto humano |
| `subtitle` | Detalhe opcional (≤120 chars) |
| `severity` | `info` \| `warn` \| `error` \| `success` |
| `visualState` | `success` \| `running` \| `warning` \| `error` \| `waiting_user` \| `completed` |
| `source` | `sse` \| `runtime` \| `daemon` \| `ui` \| `observability` |
| `relatedPhase` | Fase narrativa quando disponível |
| `isUserAction` | Acção HITL / audit UI |
| `isTerminal` | Marco final de etapa/run |

### Resultado (`RunOperationalTimeline`)

- `items` — lista cronológica deduplicada  
- `groups` — agrupamento leve por fase (intake → clarification → strategy → execution → …)  
- `currentStatus` / `currentStatusLabel` — estado no topo  
- `lastProgressAt` / `lastProgressLabel` — ex. «Último progresso há 2m 15s»

## Eventos suportados (exemplos)

- Criação: `intake_completed`, `run_created`, `job_enqueued`  
- Clarificação / approve: `clarification_*`, `clarification_approve`  
- Strategy: `strategy_started`, progresso `strategy_*`, `strategy_completed`  
- Execution: `execution_started`, `execution_progress`, `execution_completed`  
- Review / correction: `review_*`, `correction_started`  
- Falhas / alertas: `severity` warn/error, `*_failed`  
- HITL: `waiting_user*`, `human_action*`  
- Conclusão: `execution_completed`, `job_completed`, `phase2_ready_for_execution`

## Fontes utilizadas

Unificadas em `deriveRunOperationalTimeline()` via `useRunEvents()`:

| Fonte | Caminho |
|-------|---------|
| SSE + runtime API | `useRuntimeEvents` + `runtime-live-events-store` |
| Audit UI | clarification / strategy / execution / intake / action stores |
| Daemon observability | `runtime-observability-logs-store` (entradas filtradas) |

**Não altera** stores além do consumo existente.

## Dedupe / filtering

**Incluir:** tier `important` \| `progress` do classificador existente **ou** tipos operacionais explícitos (`OPERATIONAL_EXACT_TYPES` + regex de fase).

**Excluir (noise/technical):** `scheduler_tick`, `worker_idle`/`worker_busy`, `maintenance_*`, `runtime.projects.*`, `runtime.output_dir_resolved`, etc.

**Dedupe:** mesma `runtimeLogDedupeKey` → mantém o mais recente; ordenação final por `timestamp`.

## UI

- Nova aba **Timeline** no painel direito → Observabilidade (antes de Técnico e Logs).  
- Componente `RunOperationalTimelinePanel`: header com status + último progresso; lista vertical por fase; cards pequenos.  
- Logs técnicos permanecem na aba **Logs**.

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/runtime/observability/derive-run-operational-timeline.ts` | **Novo** — derivação |
| `frontend/lib/runtime/observability/derive-run-operational-timeline.test.ts` | **Novo** — 7 testes |
| `frontend/hooks/use-run-operational-timeline.ts` | **Novo** — hook |
| `frontend/components/features/observability/RunOperationalTimelinePanel.tsx` | **Novo** — UI |
| `frontend/components/features/execution-timeline/RightTimelinePanel.tsx` | Aba Timeline |

## Validações

```bash
cd frontend
npx tsx --test lib/runtime/observability/derive-run-operational-timeline.test.ts
```

Cobertura: merge multi-fonte, ordenação, dedupe, noise, terminal, waiting_user, erro, fora de ordem, último progresso.

### Manuais (checklist)

| Cenário | Esperado |
|---------|----------|
| approve → strategy | marcos clarificação + strategy na timeline |
| execution longa | `execution_progress` sem spam técnico |
| Erro | item `error` + estado no topo |
| Reopen run / refresh | eventos audit + SSE reconstituem lista |
| Run legado | o que existir em eventos/logs filtrados |
| Logs técnicos | inalterados na aba Logs |

## Limitações restantes

- Runs sem eventos persistidos mostram timeline vazia (hint na UI).  
- Títulos derivados por heurística — eventos novos podem cair em rótulo genérico até mapeamento explícito.  
- Agrupamento por fase é coarse (não replica timeline semântica central de execução).  
- `source` inferido (metadata/channel), não sempre preciso.  
- Não integra heartbeat directamente (só eventos); stall/heartbeat P1 anterior intactos.
