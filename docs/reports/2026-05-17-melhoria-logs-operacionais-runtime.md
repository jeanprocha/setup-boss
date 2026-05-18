# Relatório — Melhoria logs operacionais (Logs do runtime)

**Data:** 2026-05-17  
**Tipo:** append-only

---

## Resumo

Separação efectiva entre **Logs do runtime** (timeline operacional humana) e **Execução técnica** (stream completo + diagnóstico). Nenhum evento foi removido do backend; apenas classificação e filtro de UI.

---

## Eventos filtrados (não aparecem em Logs do runtime)

| Tipo / padrão | Motivo |
|---------------|--------|
| `workspace_run_sync.tick` | Polling interno |
| `workspace_run_sync.summary` | Telemetria de sync |
| `workspace_run_sync.backoff` | Backoff de sync |
| `workspace_run_sync.*` (geral) | Ruído de sincronização |
| `heartbeat`, `connected`, `stream-open` | Transporte / liveness |
| `scheduler_tick`, `maintenance_*` | Daemon interno |
| `worker_idle`, `worker_busy`, `worker_*` | Estado do worker |
| `job_available`, `job_claimed`, `job_scheduled`, … | Fila interna |
| `strategy_decomposition_*`, `strategy_llm_*`, `complexity_analysis`, … | Sub-passos de estratégia (marcos ficam; detalhe vai para técnico) |
| `runtime.output_dir_resolved`, `runtime.projects.*`, `clarification_initialized` | Diagnóstico / bootstrap |
| Payloads > 12 KB (classificação UX) | Dump técnico grande |
| Entradas `uiTier: noise` ou `technical` sem marco/bloqueio | Ruído normalizado |

---

## Eventos mantidos (Logs do runtime)

| Marco / situação | Exemplo de tipo |
|------------------|-----------------|
| Run / intake | `run_created`, `intake_completed` |
| SPEC / clarificação | `spec_generated`, `clarification_questions_generated`, `clarification_answers_submitted` |
| Plano | `task_plan_*`, `clarification_approve` |
| Versionamento | `git_branch_prepared`, `git_branch_failed` |
| Estratégia (marco) | `strategy_started`, `strategy_completed`, `strategy_failed` |
| Execução | `execution_started`, `execution_completed`, `execution_failed`, `phase2_ready_for_execution` |
| Review / finalização | `review_completed`, `operational_finalization_completed` |
| Workspace (marco) | `workspace_run.started`, `.advanced`, `.waiting_user_action`, `.failed` |
| Governança / validação | `governance.ia_*`, pre-run UI, categoria `validation` |
| Alertas | `severity: warn` / `error`, bloqueios (dirty, branch, mismatch, …) |

Títulos e mensagens curtas vêm de `normalizeRuntimeEvent` + rótulos em `normalize-runtime-log-for-ui` (`strategyActivityLabel`).

---

## Critérios operacionais

1. **Visibilidade UX** (`classifyRuntimeEventVisibility`): `operational` | `technical` | `hidden`.
2. **Filtro de painel** (`isOperationalRuntimeLogEntry`): aplica classificação + allowlist de marcos + denylist de sub-passos + sempre WARN/ERROR/bloqueios.
3. **Ruído alinhado** (`isLowSignalEventType` / `NOISE_EVENT_NAMES`): mesma lista base que sync/heartbeat/job queue.
4. **Vista técnica** (`viewMode="full"`): sem filtro operacional — todos os eventos ingeridos (até 500 linhas recentes).

---

## Separação UI

| Aba | Componente | Modo |
|-----|------------|------|
| Observabilidade → **Logs do runtime** | `RuntimeObservabilityLogs` | `operational` (default) |
| Observabilidade → **Execução técnica** | `RuntimeObservabilityTechnical` + secção «Stream de logs» | `full` + painel diagnóstico existente |

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/lib/runtime/observability/filter-runtime-log-operational.ts` | **Novo** — filtro operacional do painel |
| `frontend/lib/runtime/observability/filter-runtime-log-operational.test.ts` | **Novo** — 5 testes |
| `frontend/components/features/observability/RuntimeObservabilityLogs.tsx` | `viewMode`, filtro operacional |
| `frontend/components/features/observability/RuntimeObservabilityTechnical.tsx` | Stream de logs completo embutido |
| `frontend/lib/runtime/observability/runtime-log-entry-view-model.ts` | Títulos via `normalizeRuntimeEvent` |
| `frontend/lib/runtime/observability/normalize-runtime-log-for-ui.ts` | Ruído alinhado + rótulos PT |
| `frontend/lib/runtime/observability/observability-event-helpers.ts` | `isLowSignalEventType` alinhado |
| `frontend/lib/runtime/ux/classify-runtime-event-visibility.ts` | Finalização operacional; git/approval em fase info |
| `frontend/lib/runtime/ux/normalize-runtime-event.ts` | Copy git/finalização |
| `frontend/locales/pt-BR.ts`, `en.ts` | `operationalLogsEmpty` |
| `package.json` | Teste no `npm test` |

**Não alterado:** runtime executor, orchestration, daemon emit, filas, engines de execução/review.

---

## Limitações

- Sub-passos intermédios de estratégia (decomposição, LLM, etc.) não aparecem na timeline operacional — só na vista técnica.
- Daemon logs sem tipo de evento estruturado dependem de heurística por `message` + nível.
- Limite de 500 entradas recentes mantido (performance).
- Agrupamento de ruído consecutivo (`groupRepeatedRuntimeLogEntries`) aplica-se antes do filtro operacional; na vista operacional o ruído já não entra na lista.

---

## Validação manual

1. Abrir run activa → **Observabilidade → Logs do runtime**: confirmar marcos (plano, branch, execução) sem `sync.tick` / `heartbeat`.
2. **Execução técnica** → secção **Stream de logs**: confirmar eventos de sync, worker, payloads e sub-passos de estratégia.
3. Provocar WARN/ERROR (ex.: branch falhada, `.IA` ausente): deve aparecer em **Logs do runtime**.
4. Filtros de categoria/pesquisa na toolbar operacional continuam a funcionar sobre o subconjunto filtrado.

**Testes automáticos:** `node --experimental-strip-types --test frontend/lib/runtime/observability/filter-runtime-log-operational.test.ts` (5/5).

---

## Critério de aceite

| Item | Estado |
|------|--------|
| Logs do runtime só operacionais relevantes | OK |
| WARN/ERROR/bloqueios visíveis | OK |
| Técnico completo em Execução técnica | OK |
| Sync/polling/backoff fora da timeline operacional | OK |
| Sem mocks novos | OK |
