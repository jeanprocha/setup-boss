# Relatório — Execução materializada: transições no runtime (Slice 2)

**Data:** 2026-05-17  
**Fase:** 6 — Handoff planejamento aprovado → execução por mini-task  
**Pré-requisito:** [Slice 1](./2026-05-17-oes-materialized-execution-slice1.md)

---

## Resumo

O executor passa a **escrever transições reais** em `execution/execution-runtime-state.json`. As miniActivities deixam de depender apenas de sync read-only com `execution/subtasks/*` e passam a reflectir o lifecycle operacional durante execução e review. Runs legadas (sem state) continuam com fallback para subtasks; falhas ao actualizar state não interrompem o executor.

---

## Transições implementadas

| De | Para | Momento |
|----|------|---------|
| `pending` / `blocked_by_dependency` | `ready` | `refreshMiniActivityDependencyGates` (deps satisfeitas) |
| `ready` | `running` | Início de `runSingleSubtaskExecutorMvp` |
| `running` | `review` | Início de `runExecutionReviewPhase` |
| `running` | `failed` | Falha no executor MVP |
| `review` | `completed` | Review aprovada |
| `review` | `failed` | Review rejeitada/bloqueada |
| — | `blocked_by_dependency` | Tentativa de `running` com deps incompletas (rejeitada) |

Cada transição regista em `transitionHistory[]`: `from`, `to`, `at`, `reason`, `miniTaskId`, `executionRef`, `subtaskRef` (quando existem).

**Review granular (base):** campos por miniActivity — `reviewStatus`, `reviewSummary`, `reviewArtifactRef`, `correctionRequired`.

---

## Módulos

| Módulo | Função |
|--------|--------|
| `core/update-execution-runtime-state.js` | Utilitário central: validar transição, deps, histórico, aggregate, escrita atómica |
| `scripts/runtime/execution-runtime/run-subtask-executor.js` | `running` / `failed` |
| `scripts/runtime/execution-runtime/run-execution-review.js` | `review` / `completed` / `failed` + refresh de gates |
| `scripts/runtime/execution-runtime/run-execution-runtime.js` | Refresh pós-materialização e pós-fases |
| `scripts/daemon/lib/run-execution.js` | Leitura sem `sync` (executor = fonte de verdade) |
| `core/map-execution-runtime-state-dto.js` | Campos de review no DTO |
| `frontend/.../execution-operational-state.ts` | Agrupamento UI: Em curso, Em revisão, Bloqueadas, Próximas, Falhou, Concluídas |
| `frontend/.../ExecutionPhasePanel.tsx` | Secções visuais mínimas |

---

## Testes

```bash
node --test core/update-execution-runtime-state.test.js
node --test core/materialize-execution-runtime-from-oes.test.js
```

Cobertura slice 2: `ready → running → review → completed`, falha, bloqueio por dependência, histórico com refs, aggregate status, runs legadas, `tryTransition` seguro.

---

## Compatibilidade

| Cenário | Comportamento |
|---------|----------------|
| Sem `execution-runtime-state.json` | `tryTransition*` retorna `legacy: true`; executor continua |
| Erro ao gravar state | `tryTransitionMiniActivity` captura excepção → warning, sem abortar execução |
| `GET /runs/:id/execution` | Materializa se ausente; **não** faz sync que sobrescreve transições do executor |
| Runs só com subtasks legadas | UI usa `subtasks` do bundle (inalterado) |

---

## Limitações

1. **Sequencial** — uma subtask por invocação do executor MVP; sem paralelismo.
2. **Sync read-only** — `syncExecutionRuntimeMiniActivities` mantido para ferramentas/diagnóstico, mas removido do path de leitura API.
3. **Correcção granular** — `correctionRequired` registado; fluxo de correção por mini-task fica para slice seguinte.
4. **Transições administrativas** — não há UI para forçar retry/skip de miniActivity neste slice.

---

## Próximos passos

1. **Slice 3** — Review HITL por mini-task com `completionCriteria` + `validationHints`.
2. **Retry por etapa** — só miniActivity falhada.
3. **Correcção** — loop usando `correctionRequired` + reentrada `running`.
4. **Observabilidade** — eventos de transição no `execution-diagnostics.json`.
5. **Paralelismo** — quando `orderingMode === parallel` (fora do MVP sequencial).
