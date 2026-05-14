# Fase 4.12.1 — Execution Graph Model

## Escopo entregue

- Modelo estrutural do pipeline como grafo dirigido (DAG nas arestas **hard**; ciclo de correção modelado em **`repeat_edges`**).
- Artefacto derivado **`execution-graph.json`** na pasta oficial da corrida: **`<projectRoot>/.IA/outputs/<runId>/`** (o path genérico `outputs/<run-id>/` no repositório setup-boss refere-se ao espelho `.IA/outputs` no projeto alvo).
- Flag **`SETUP_BOSS_EXECUTION_GRAPH`**: `off` (default) \| `shadow`.
- Integração **apenas** em `scripts/runtime/run-runtime.js` (pós-`startFlow` / `startFlowResume`), sem alterar `orchestration.js` nem runtimes de etapa.

## Módulo

```text
scripts/runtime/graph/
  constants.js       — IDs, kinds, versão schema, nome do ficheiro
  schema.js          — enums permitidos + validateExecutionGraphDoc
  stable-json.js     — stringify determinística (chaves ordenadas)
  graph-builder.js   — buildCanonicalExecutionGraph + ordem topológica hard
  graph-validation.js— ciclos (hard / genérico), alcançabilidade, validação doc
  fingerprint.js     — SHA-256 estável (sem timestamps, sem run_id)
  artifact-writer.js — buildExecutionGraphDocument + writeExecutionGraphArtifact
  feature-flags.js   — SETUP_BOSS_EXECUTION_GRAPH
  shadow-hook.js     — tryWriteShadowExecutionGraphArtifact (swallow errors)
  index.js           — API pública
  execution-graph.test.js
```

## Nós e dependências (hard)

Ordem canónica do backbone: **scan → architect → execution_plan → executor → validation_plan → validator_executor → review**.

Ramificações **condicionais** (sem fechar DAG nas hard): **review → knowledge** (`review_approved`), **review → correction** (`review_requires_correction`).

**Repeat:** **correction → executor** (`correction_loop`) em `repeat_edges`.

## Estados (4.12.1)

Por nó: apenas **`pending`** \| **`ready`** \| **`blocked`**. O builder inicializa tudo em **`pending`**; scheduler e transições ficam para fases posteriores.

## Fingerprint

- Input: `schema_version`, `pipeline_variant`, nós (`node_id`, `kind`, `iteration`, `artifacts_expected` ordenados), `edges` e `repeat_edges` canónicos.
- **Exclui**: timestamps, `run`, `status`, comentários.
- Mesmo grafo → mesmo hash entre execuções.

## Testes

```bash
node --test scripts/runtime/graph/execution-graph.test.js
```

Incluído também em `npm test`.

## Limitações explícitas (4.12.1)

- Sem scheduler, sem execução por nó, sem replay automático, sem paralelismo.
- `execution-graph.json` é **só observabilidade / contrato futuro**; o pipeline não o lê.
- Nomes em `artifacts_expected` são **indicativos** (documentação do modelo), não validação de disco nesta fase.

## Ver também

- `docs/execution-graph-runtime/phase-4-12-2-graph-state-runtime.md`
- `docs/execution-graph-runtime/execution-graph-model-discovery.md`
- `docs/execution-graph-discovery-summary.md`
