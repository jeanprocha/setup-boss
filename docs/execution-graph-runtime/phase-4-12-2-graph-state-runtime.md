# Fase 4.12.2 — Graph State Runtime

## Escopo

- **Persistência** do estado por nó do grafo canónico (sobre a 4.12.1).
- **Máquina de transição determinística** (validação explícita de pares `from → to`).
- Artefacto derivado **`execution-graph-runtime.json`** em **`<projectRoot>/docs/.IA/outputs/<runId>/`** (legado: **`<projectRoot>/.IA/outputs/<runId>/`**).
- Flag **`SETUP_BOSS_EXECUTION_GRAPH_RUNTIME=off`** (default) **| `shadow`**.
- Integração **apenas** na camada shadow: `tryWriteShadowExecutionGraphArtifacts` em `scripts/runtime/graph/shadow-hook.js` (chamada a partir de `scripts/runtime/run-runtime.js`). **`orchestration.js`** não é alterado.

## Módulo (`scripts/runtime/graph/runtime-state/`)

| Ficheiro | Função |
|---------|--------|
| `constants.js` | Schema do artefacto runtime, estados completos, nome do ficheiro |
| `feature-flags.js` | `SETUP_BOSS_EXECUTION_GRAPH_RUNTIME` |
| `transitions.js` | `ALLOWED_TRANSITIONS`, `isTransitionAllowed`, `validateTransitionPair` |
| `state-schema.js` | `validateExecutionGraphRuntimeDocShape` |
| `validators.js` | Alinhamento doc↔grafo, fingerprint embutido, monotonia de `seq`, sequências |
| `snapshot-builder.js` | `buildInitialRuntimeSnapshot`, `buildLifecycleSummary` |
| `transition-engine.js` | `applyRuntimeTransition` (mutação + validação de ordem) |
| `artifact-writer.js` | `writeExecutionGraphRuntimeArtifact` (validação antes de gravar) |
| `shadow-hook.js` | `tryWriteShadowExecutionGraphRuntimeArtifact` (best-effort) |
| `index.js` | reexports |
| `runtime-state.test.js` | testes |

## Estados e transições

Estados: **`pending` → `ready` → `running` → `completed` \| `failed`**, mais **`skipped`**, **`blocked`**.

Exemplos **válidos**:

- `pending → ready`, `ready → running`, `running → completed`, `running → failed`
- `pending → blocked`, `pending → skipped`, `ready → blocked`, `ready → skipped`, `running → blocked`

**Terminais** (sem saída para estados operacionais nesta fase): `completed`, `failed`, `skipped`, `blocked`.

Exemplos **inválidos** (rejeitados por `validateTransitionPair`): `completed → running`, `failed → pending`, `skipped → running`, etc.

## Artefacto `execution-graph-runtime.json`

Campos principais (ver código para detalhe):

- `schema_version`, `graph_id`, `graph_fingerprint`, `run_id`
- `created_at`, `updated_at`, `runtime_state_version`
- `nodes_runtime_state[]` — por nó: `node_id`, `kind`, `current_status`, `attempts`, `timestamps`, `last_transition`, `transition_history[]`, `replay_generation`, `blocked_reason?`
- `attempts` — `global` (snapshot de `correction_iterations` / `pipeline_status`) e `by_node_id`
- `transitions[]` — log global com `seq` monotónico
- `lifecycle_summary` — contagens determinísticas por estado
- `replay_metadata` — `structural_fingerprint_sha256`, `replay_generation`, invariante declarada
- `metadata`, `compat`, `links`
- `embedded_structural_graph` — cópia do grafo estrutural para verificação **offline** (fingerprint deve coincidir com `graph_fingerprint`)

## Replay-safe

- O **fingerprint estrutural** do grafo embutido deve igualar `graph_fingerprint` (`validateEmbeddedGraphFingerprint`).
- Transições e históricos usam **`seq`** crescente; validadores detetam logs fora de ordem.
- **`updated_at` / `timestamps`** são observabilidade; não entram no fingerprint do grafo 4.12.1.

## Limitações (4.12.2)

- **Sem scheduler**: o hook shadow só grava **snapshot inicial** (todos os nós `pending`). `applyRuntimeTransition` existe para testes e para **4.12.3**; não é acoplado ao pipeline real.
- **`ready` / `running`**: não são atribuídos pela orquestração nesta fase.
- O pipeline **não lê** este ficheiro; falhas de escrita são **silenciosas** (ou `SETUP_BOSS_EXECUTION_GRAPH_DEBUG=1`).

## Próximos passos (4.12.3)

- Scheduler incremental que consome/atualiza `execution-graph-runtime.json`.
- Sincronização opcional com fases reais (`emitBridge` / checkpoints) mantendo o adapter fino.

## Relação com 4.12.1

- `SETUP_BOSS_EXECUTION_GRAPH=shadow` continua a gerar `execution-graph.json`.
- `SETUP_BOSS_EXECUTION_GRAPH_RUNTIME=shadow` gera **`execution-graph-runtime.json`** (independente; pode usar só runtime shadow).
- `tryWriteShadowExecutionGraphArtifacts` invoca ambos os hooks quando as respetivas flags estão ativas.

Ver também: `docs/execution-graph-runtime/phase-4-12-1-execution-graph-model.md`, `docs/execution-graph-runtime/graph-runtime-state-discovery.md`.
