# P1c — Intake Status Honesto

**Data:** 2026-05-16  
**Escopo:** UX/status na lista/sidebar após `POST /runs` — sem alterar worker, fila async ou polling.

## Problema

Após criar uma atividade, o job de intake na fila fica `completed` (o trabalho do *job* terminou), mas a missão continua em clarificação, estratégia ou pronta para executar. A UI derivava `RunSummaryDto.state` principalmente de `mapJobStatusToUiState(job.status)`, mapeando `completed` → `success` (“Concluído” / faixa verde).

Pontos adicionais:

- `stateFromJobMetadata` ignorava `metadata.initialState` / `orchestrationState` quando `uiState` não estava na lista curta.
- `run-orchestration-sync` pode gravar `uiState: "completed"` (string inválida no contrato UI), o que caía no fallback enganoso.
- Jobs sintéticos do run-index usam `uiState: "success"` por defeito (fora do escopo de corrigir disco).

## Onde o status enganoso era calculado

| Camada | Ficheiro | Função |
|--------|----------|--------|
| Mapeamento API → DTO | `frontend/lib/runtime/adapters/map-job.ts` | `stateFromJobMetadata` → `mapJobStatusToUiState` |
| Regra bruta | `frontend/lib/runtime/adapters/map-status.ts` | `completed` → `success` |
| Lista sidebar | `frontend/components/regions/ProjectActivitySidebar.tsx` | `runStripeClass(run.state)` + tooltip |
| Badge alternativo | `frontend/components/primitives/RuntimeCard.tsx` | `StatusBadge(state={run.state})` |

## Regra nova de derivação

Módulo: `frontend/lib/runtime/adapters/derive-honest-run-display.ts`

Prioridade:

1. Job `running` / `pending` na fila → estado da fila (execução activa na queue).
2. `metadata.orchestrationState` terminal (`execution_completed` / `execution_failed`) → estado e rótulo workflow correspondentes.
3. Orquestração activa (`execution_running`, `execution_reviewing`, …) → `running` + rótulo workflow.
4. `metadata.uiState` válido (contrato `RuntimeUiState`), excepto hints terminais (`success` / `completed` / `recovered`) sem orquestração terminal.
5. `metadata.initialState` (`clarification_required`, `strategy_pending`, `ready_for_execution`, …) → `RuntimeUiState` + chave `workflow.*`.
6. `metadata.uiPhase` (`clarify`, `strategy`, `intake`) como fallback.
7. Job `completed` sem sinal de missão concluída → **nunca** `success` por defeito.

Saída: `{ state: RuntimeUiState, operationalStatusKey: WorkflowStatusKey | null }` persistida em `RunSummaryDto`.

Rótulo humano na lista: `runSummaryStatusLabel()` em `runtime-labels.ts` — prioriza `workflow.{operationalStatusKey}` (pt-BR).

## Ficheiros alterados

- `frontend/lib/runtime/adapters/derive-honest-run-display.ts` (novo)
- `frontend/lib/runtime/adapters/derive-honest-run-display.test.ts` (novo)
- `frontend/lib/runtime/adapters/map-job.ts`
- `frontend/lib/runtime/adapters/map-status.ts` (import relativo para testes node)
- `frontend/lib/runtime/adapters/runtime-labels.ts` (`runSummaryStatusLabel`)
- `frontend/lib/api/runtime-types.ts` (`operationalStatusKey`)
- `frontend/locales/pt-BR.ts`, `en.ts` (`workflow.ready_for_execution`)
- `frontend/components/regions/ProjectActivitySidebar.tsx`
- `frontend/components/primitives/StatusBadge.tsx`, `RuntimeCard.tsx`

## Testes executados

```text
node --experimental-strip-types --test frontend/lib/runtime/adapters/derive-honest-run-display.test.ts
```

6/6 pass:

- job `completed` + `clarification_required` ≠ concluído
- job `completed` + `strategy_pending` ≠ concluído
- `execution_completed` → concluído
- `failed` → falhou
- `uiState: "completed"` inválido sem orquestração terminal ≠ success
- job `running` mantém running

## Validação manual (checklist)

Com `npm run dev:stack` e runtime online:

1. Criar nova atividade num projeto com clarificação.
2. Após intake, na sidebar: faixa **não** verde de sucesso; tooltip com “Clarificação pendente” (ou respostas).
3. Seleccionar a run criada — deve manter-se seleccionada (`use-create-run` + reconciliação existentes).
4. Avançar para estratégia — tooltip “Estratégia pendente”, estado `blocked` (âmbar), não “Concluído”.
5. Concluir execução real (`orchestrationState: execution_completed`) — aí sim faixa verde / “Concluído”.

## Não implementado (conforme escopo)

- Intake async, refactor da fila, worker, polling, regras `.IA` novas.
