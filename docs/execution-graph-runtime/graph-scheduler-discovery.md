# Graph Scheduler — Discovery (MVP sem paralelismo)

## Como o “próximo passo” é decidido hoje

| Contexto | Mecanismo | Determinismo |
|----------|-----------|--------------|
| `startFlow` | Chamadas `await` sequenciais explícitas. | Totalmente determinístico no código. |
| Pós-executor | `runPostExecutorLoop`: primeiro sempre `runReviewStep`, depois ramifica por JSON review. | Lógica procedural. |
| Correction | Incremento `correction_iterations` + `await runExecutorStep` — **reentrada** no mesmo fluxo. | Ordem fixa: correction → executor → review de novo. |
| Resume | `assessResume` em `resume-engine.js`: árvore de decisão sobre existência de `executor-result.json`, `review-output.json`, `correction-instructions.md`, `run-log.json`, governance. | Determinístico dado filesystem consistente. |

Não existe fila de “nós prontos” — existe **um único ponteiro implícito**: a função JS atual na stack.

## Loops sequenciais relevantes

- **`for (;;)`** em `runPostExecutorLoop` — único loop macro de negócio (review/correction).
- **`runExecutorWithRecovery`** — loop micro dentro do executor.
- **Daemon `scheduler-loop.js`** — escala **jobs** na fila `.setup-boss/daemon/queue.json`, não steps internos do pipeline; eventos `job_available`, `retry_available`. Fronteira clara: daemon orquestra **invocações** de run/resume, não DAG interno.

## Onde correction “reinicia” fluxo

- Após `runCorrection`, chama-se `runExecutorStep` de novo — equivalente a **saltar para o nó executor** mantendo mesmo `runId` e output dir.
- Review e knowledge **não** são saltados implicitamente; review corre de novo após executor.

## Onde validation “bloqueia”

- `runValidationRuntimeAfterTargeting` — engolido em try/catch no orchestrator.
- Bloqueio real ocorre via **`runGovernanceRuntimeHook` POST_VALIDATION** se política enforce carregar `GovernanceEnforcementError` — efeito colateral **fora** do validation runtime isolado.

## Retries

- **Executor**: budget session + classificador (`executor-recovery-loop.js`).
- **Provider**: retries LLM (`provider-retry`) — ortogonal ao DAG.
- **Correction supression**: não é retry — é **parada** do loop com finish partial.

## Pontos candidatos a “scheduler MVP” (futuro)

1. **Substituir o corpo de `runPostExecutorLoop`** por uma função `nextRunnableNode(graph, state)` que devolve no máximo **um** nó — preserva ausência de paralelismo.
2. **`startFlowResume`** mapear `next_phase` string → seed do mesmo scheduler com estado parcial.
3. **Hook pós-cada-nó** (overlay): atualizar `execution-graph-runtime.json` + comparar ordem linear vs topological order **só em shadow**.

## Queue boundaries

- **Externo**: daemon queue (jobs por projeto/tempo).
- **Interno (futuro)**: fila opcional de nós `ready` com política FIFO estável; arestas só desbloqueiam um nó quando deps satisfeitas.

## Deterministic traversal (requisitos)

- Ordenação de nós prontos deve ser **estável** (ex.: ordem lexical de `node_id` ou prioridade fixa alinhada ao pipeline atual) para evitar drift entre máquinas.
- Replay parcial: scheduler deve aceitar `forced_completed` / `pin_input_hashes` (fase posterior) — hoje não existe.

## Traço equivalente linear → topological

O pipeline atual já é uma **ordem topológica válida** de um DAG em cadeia; introdutor de DAG não exige mudar a ordem até aparecerem arestas “largas” ou paralelismo (fora de escopo).

## Arquivos

- `scripts/runtime/orchestration.js` — `runPostExecutorLoop`, `startFlow`, `startFlowResume`
- `scripts/runtime/replay/resume-engine.js`
- `scripts/daemon/lib/scheduler-loop.js` — apenas contexto job-level
