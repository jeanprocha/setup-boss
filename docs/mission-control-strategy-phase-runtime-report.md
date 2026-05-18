# Mission Control — Fase 3 Strategy (runtime operacional)

## Resumo

A UI já tinha o hook `useStrategyStageGeneration` e o `StrategyStageHero` com POST ` /runs/:runId/strategy`, mas a secção **Strategy** do Mission Control **não montava** quando a corrida estava em fase API `clarification` com estado `success`/`running` (handoff pós-approve): `strategyAppliesToRun` só tratava `clarify`, não `clarification`. O GET de strategy ficava desligado (`enabled: false`), o painel não renderizava e o utilizador só via “Strategy pendente” noutros sítios sem CTA.

## Causa raiz

- `frontend/lib/runtime/strategy/strategy-state.ts` — `strategyAppliesToRun` comparava `p === "clarify"`; a API de resumo usa `phase: "clarification"` (normalizado em `mapRawPhaseToLifecycleId`).
- `fetchStrategyBundle` devolvia **mock** em 404 / fallback — violava “fonte da verdade = Runtime API”.

## Comportamento antes / depois

| Antes | Depois |
|--------|--------|
| `clarification` + `success` → strategy query desligada | `clarification` **ou** `clarify` + `success`/`running` → strategy query **ligada** |
| Secção Strategy (RunViewShell) omitida | Secção Strategy montada; **Iniciar estratégia** visível em `strategy_pending` operacional |
| Mock em 404 GET strategy | `buildUnsupportedStrategyBundle` (source `unsupported`, sem fixtures de demo) |
| SSE invalidava sobretudo `execution` / root | Throttle de invalidação também **strategy** + **clarification** por `runId` |

## Fluxo completo (runtime)

1. Clarificação aprovada; `phase2.status` → `ready_for_execution`; sessão `runtimePhase` → `strategy_pending`.
2. Backend emite `strategy_waiting_user_action` (hint `POST /runs/:runId/strategy`).
3. UI: `needsDominantStrategyCta` + GET strategy activo → hero **Iniciar estratégia**.
4. Utilizador: POST `/runs/:runId/strategy` com `{ force?: boolean }` (opcional). Resposta **202** (trabalho iniciado) ou **200** se idempotente/`skipped`.
5. `run-strategy-api` corre `runStrategyRuntimeBase`, emite `strategy_requested` / `strategy_started` / `strategy_completed` ou `strategy_failed`.
6. Read-model: GET `/runs/:id/strategy` passa a reflectir `strategy_generating` → `strategy_ready` / `ready_for_execution` conforme artefactos.
7. React Query: `useStrategyStageGeneration` invalida `strategy`, `clarification`, `execution` e `runtime` root; SSE reforça invalidação por `runId`.

## Estados (referência)

### Clarificação (`runtimePhase` no bundle clarification)

- `clarification_required`, `clarification_empty`, `waiting_answers`, `refining`, `refinement_ready`, `awaiting_approval`, `approved`, `rejected`, `ready_for_execution`, **`strategy_pending`**, `unavailable`

Listagem canónica: `frontend/lib/runtime/mission/runtime-workflow-phases.ts` (`CLARIFICATION_RUNTIME_PHASES`, rótulos PT).

### Strategy (`summary.runtimePhase` no bundle strategy)

- `strategy_pending`, `strategy_generating`, `strategy_ready`, `strategy_blocked`, `strategy_failed`, `strategy_approved`, `ready_for_execution`, `unavailable`

Listagem: `STRATEGY_RUNTIME_PHASES` no mesmo ficheiro.

### Execução (read-model execution)

Ver `ExecutionLifecyclePhase` em `frontend/lib/runtime/execution/execution-types.ts` e `EXECUTION_LIFECYCLE_PHASES` no ficheiro de workflow.

## Eventos SSE relevantes

- `strategy_waiting_user_action` — aguarda POST strategy.
- `strategy_requested`, `strategy_started`, `strategy_completed`, `strategy_failed` — progresso / erro.

O bus de SSE (`runtime-event-bus`) invalida queries por `runId`: `execution`, `strategy`, `clarification`, `runEvidence`, mais `runtime` root e `projectRuns`.

## UX operacional (Mission Control)

- **Hero** (`StrategyStageHero`): título alinhado a `labelStrategyRuntimePhase("strategy_pending")`, botão **Iniciar estratégia**, texto **Iniciando estratégia…** durante POST + refetch do read-model, erro com mensagem da API (`RuntimeApiError`).
- **Badges**: `ClarificationStateBadge` / `StrategyStateBadge` — `strategy_pending` mostra **accção necessária** (ícone mão, sem spinner fictício de “loading infinito”).

## Payloads API

- **POST** `/runs/:runId/strategy` — corpo JSON opcional: `{ "force": true }` para forçar re-geração quando o runtime aceita.
- **Respostas**: `202` / `200` com `{ ok: true, data: { skipped?, strategySummary? } }`; erros com `ok: false` e `error.code` / `error.message` (ex.: `strategy_phase2_not_ready` → HTTP 409).

## Ficheiros alterados

- `frontend/lib/runtime/strategy/strategy-state.ts` — `strategyAppliesToRun` com `clarification`.
- `frontend/lib/runtime/strategy/strategy-adapters.ts` — `buildUnsupportedStrategyBundle`.
- `frontend/lib/runtime/strategy/strategy-actions.ts` — sem mock; 404 → unsupported real.
- `frontend/lib/runtime/mission/runtime-workflow-phases.ts` — **novo**: listas + rótulos PT centralizados.
- `frontend/lib/runtime/intake/intake-state.ts` — rótulo intake `strategy_pending` alinhado.
- `frontend/hooks/use-strategy-stage-generation.ts` — invalidação de `execution` após sucesso.
- `frontend/lib/runtime/sse/runtime-event-bus.ts` — invalidar `strategy` + `clarification` por `runId`.
- `frontend/components/features/strategy/StrategyStageHero.tsx` — copy operacional, loading, botão.
- `frontend/components/features/clarification/ClarificationStateBadge.tsx` — estado `strategy_pending`.
- `frontend/components/features/strategy/StrategyStateBadge.tsx` — idem.
- `scripts/daemon/runtime-api.test.js` — teste HTTP POST strategy run inexistente → 404.

## Testes

- `cd frontend && npx tsc --noEmit`
- `node --test scripts/daemon/runtime-api.test.js --test-name-pattern="POST /runs/:id/strategy"`

Testes de componente React (botão só em `strategy_pending`, etc.) **não** estão no `package.json` do frontend (sem runner). Validação manual recomendada no Mission Control com corrida real em `strategy_pending`.

## Limitações MVP

- Não há progresso fino (% por sub-artefacto strategy) na UI — só fases do read-model e eventos SSE.
- `POST` pode demorar até `SETUP_BOSS` timeout longo no proxy Next (já configurado para strategy).
- Idempotência: segundo POST sem `force` pode devolver `skipped: true` quando artefactos já estão completos.

## Próximos passos (opcional)

- Testes E2E smoke (`smoke:mvp-web-ui-e2e`) cobrindo clique + verificação de fase.
- Unificar rótulos restantes (`Strategy pronta` → PT) com `STRATEGY_RUNTIME_PHASE_LABELS_PT`.
