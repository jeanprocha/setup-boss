# Relatório — Materialização da execução a partir do OES (Slice 1)

**Data:** 2026-05-17  
**Fase:** 6 — Handoff planejamento aprovado → execução por mini-task  
**Contrato:** [`docs/operational-executable-strategy-contract.md`](../operational-executable-strategy-contract.md)

---

## Resumo

A estratégia operacional executável (OES) passa a materializar **miniActivities reais** em `execution/execution-runtime-state.json`, com lifecycle operacional, rastreabilidade e sincronização read-only com os artefactos `execution/subtasks/*`. O executor MVP **não foi alterado**; runs legadas continuam com o fluxo linear anterior.

---

## Lifecycle

```
pending / blocked_by_dependency
        ↓ (deps satisfeitas)
      ready
        ↓ (subtask executing — sync)
     running
        ↓ (review_state / execution_state)
      review
        ↓
    completed | failed
```

- **Sequencial** — respeita `dependsOnIds` do OES; sem paralelismo neste slice.
- **blocked_by_dependency** — mini-tarefa com dependências ainda não concluídas.
- **Sync** — `syncExecutionRuntimeMiniActivities` atualiza status a partir de `001-execution.json` sem invocar o executor.

---

## Estrutura persistida

**Ficheiro:** `execution/execution-runtime-state.json`

| Campo | Descrição |
|-------|-----------|
| `traceability` | `strategySha256`, `planVersion`, `sourcePlanSha256`, `sourcePlanRef`, `sourceCommentId`, `sourcePlanId`, `oesVersion` |
| `miniActivities[]` | Entidades materializadas com objetivo, escopo, critérios, deps, `linkedSubtaskExecutionRel` |
| `aggregatedStatus` | `pending` \| `ready` \| `running` \| `review` \| `completed` \| `failed` |
| `currentMiniActivityId` | Mini-tarefa activa (running/review/ready) |
| `transitionHistory` | Histórico de transições por mini-tarefa |

---

## Handoff

| Momento | Acção |
|---------|--------|
| Início do execution runtime | `materializeExecutionRuntimeFromOes` após `materializeSubtaskExecutionStates` |
| Leitura do bundle (`GET /runs/:id/execution`) | Tenta materializar se ausente; `syncExecutionRuntimeMiniActivities`; expõe `materializedExecution` no DTO |
| UI Execução | `ExecutionPhasePanel` agrupa Em curso / Próximas / Concluídas quando `materializedExecution` presente |

**Rastreabilidade respondida:**

- Qual mini-task originou a execução? → `miniTaskId` / `miniActivityId` + `linkedSubtaskExecutionRel`
- Qual plano aprovou? → `traceability.sourcePlanSha256` + `sourcePlanRef`
- Qual estratégia? → `traceability.strategySha256`
- Comentário que gerou o plano? → `sourceCommentId` (último comentário em `plan-comments/`, quando existir)

---

## Módulos

| Módulo | Função |
|--------|--------|
| `core/materialize-execution-runtime-from-oes.js` | Materializar + sync + load |
| `core/map-execution-runtime-state-dto.js` | Projeção API/frontend |
| `scripts/runtime/execution-runtime/run-execution-runtime.js` | Hook pós-subtask init |
| `scripts/daemon/lib/run-execution.js` | Bundle com `materializedExecution` |
| `frontend/lib/runtime/execution/execution-types.ts` | DTOs |
| `frontend/lib/runtime/execution/execution-adapters.ts` | Map API |
| `frontend/lib/runtime/operational/execution-operational-state.ts` | Labels + agrupamento UI |
| `frontend/components/features/planning/ExecutionPhasePanel.tsx` | Painel por mini-tarefa |

---

## Compatibilidade

| Cenário | Comportamento |
|---------|----------------|
| Run sem OES / sem subtasks | `materialize` retorna `legacy: true`; UI usa `subtasks` do bundle anterior |
| Run com OES | `execution-runtime-state.json` criado; UI prioriza miniActivities materializadas |
| Re-materialização | Idempotente (`skipped: true`) salvo `force: true` |

---

## Testes

```bash
node --test core/materialize-execution-runtime-from-oes.test.js
```

Cobertura: materialização rica, dependências, sync com subtask executing, legado, DTO, `depsSatisfied`.

---

## Riscos

1. **targetProjectId** — não aplicável ao modelo single-run; workspace multi-projeto continua com `MiniActivityRecord` separado.
2. **Aprovação explícita da estratégia** — ainda não exige `operational-executable-strategy.approved.json`; usa OES gerado no strategy runtime.
3. **Executor** — estados `running`/`review` dependem do sync na leitura do bundle; o executor não escreve directamente no `execution-runtime-state.json`.

---

## Próximos passos

1. **Slice 2** — Executor escreve transições directamente no `execution-runtime-state.json`.
2. **Review granular** — gate HITL por mini-tarefa usando `completionCriteria` + `validationHints`.
3. **Retry por etapa** — só mini-tarefa falhada.
4. **Aprovação OES** — `strategy_sha256` em `approval-state.json` + snapshot aprovado.
5. **Paralelismo** — quando `orderingMode === parallel` (fora deste slice).
