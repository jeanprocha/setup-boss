# Fase 4.12.5 — Runtime Node Adapters

## Objetivo

Introduzir **wrappers finos** por `node_id` do grafo canónico (4.12.1): **descritores**, **contratos de execução** (API estática), **metadados de capacidade** e **matrizes** (replay, shadow, advisory, recuperação, scheduler). Esta fase **não** invoca `scan.js`, `executor.js`, `orchestration.js` ou outros runtimes de etapa; serve como **camada de preparação** para 4.12.6+ (replay parcial, binding real).

## Arquitetura

```text
scripts/runtime/graph/node-adapters/
  constants.js           — schema artefacto, nome ficheiro, fase
  feature-flags.js       — SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS
  runtime-descriptors.js — enums (runtime_type, execution_kind, side_effect_level, replay_sensitivity)
  capability-model.js    — advisory_only, replay_safe, deterministic, …
  execution-contract.js   — createExecutionContract (resolveInputs, …) — só dados estáticos
  adapter-base.js        — RuntimeNodeAdapter (serialize / serializeContractSummary)
  advisory-bridge.js      — matrizes advisory / recovery / scheduler compatibility
  validators.js          — duplicados, cobertura DAG, contratos, alinhamento replay↔capability
  adapter-registry.js    — registo determinístico + validação agregada
  artifact-writer.js      — buildNodeAdaptersArtifact + write
  shadow-hook.js         — tryWriteShadowNodeAdaptersArtifact (best-effort)
  adapters/*.js          — um ficheiro por nó (scan, architect, …)
  node-adapters.test.js
```

- **Binding layer**: `RuntimeNodeAdapter` expõe `descriptor` + `getContract()`; o contrato devolve estruturas derivadas do descritor, sem I/O.
- **Registry único**: `createAllAdaptersInOrder()` ordena por `node_id`; `buildRegisteredAdapterRegistry(graph)` valida cobertura 1:1 com `graph.nodes`.

## Execution contracts

Interface lógica (implementação em `execution-contract.js`):

| Método | Comportamento 4.12.5 |
|--------|----------------------|
| `resolveInputs()` | Lista canónica de chaves de entrada esperadas (ordenada) |
| `resolveOutputs()` | Chaves de saída esperadas |
| `validateRuntimeContext(ctx)` | Valida **forma** (`run_id`/`output_dir` string se presentes) |
| `getRuntimeCapabilities()` | Cópia do modelo de capacidades |
| `getExpectedArtifacts()` | Artefactos principais alinhados ao grafo |

Nenhum método despacha work para handlers reais.

## Capability model

Campos booleanos por nó (`buildCapabilityModel`):

- `advisory_only` — nó conceptualmente **shadow** (ex.: execution-plan compiler).
- `replay_safe` — coerente com `supports_replay` (validado).
- `deterministic` — fronteira determinística declarada (LLM em geral `false`).
- `produces_side_effects` — derivado de `side_effect_level`.
- `idempotent` / `resumable` — conforme descritor baseado em `execution-node-mapping.md`.

## Advisory bridge

- **`advisory_execution_matrix`**: cada `node_id` com `advisory_scheduler_compatible`, `shadow_eligible`, nota sobre limites do MVP scheduler (sem `repeat_edges` na simulação).
- **`runtime_recovery_matrix`**: explicitamente **não** acoplado — recovery continua no pipeline existente.
- **`scheduler_compatibility_matrix`**: compatível com scheduler serial 4.12.3; `n-correction` assinalado como parte do repeat loop real.

## Flags

| Variável | Valores | Comportamento |
|----------|---------|----------------|
| `SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS` | `off` (default) \| `shadow` | `off`: nada. `shadow`: grava `execution-graph-node-adapters.json` no **outputDir** da run (best-effort; erros engolidos; **exit code** inalterado). |

Integração: `tryWriteShadowExecutionGraphArtifacts` em `scripts/runtime/graph/shadow-hook.js` (pós-run, **isolado** da orquestração).

## Artefacto: `execution-graph-node-adapters.json`

| Campo | Descrição |
|-------|------------|
| `schema_version` | Inteiro (≥ 1). |
| `graph_id` | `graph_<32 hex prefix>` do fingerprint (alinhado a runtime snapshots). |
| `graph_fingerprint` | SHA-256 do grafo estrutural (4.12.1). |
| `run_id` | ID da corrida. |
| `registered_adapters` | Array de descritores serializados por nó. |
| `adapter_capabilities` | Mapa `node_id` → capability model. |
| `runtime_contracts` | Mapa `node_id` → resumo estático do contrato (sem funções). |
| `replay_support_matrix` | Por nó: `supports_replay`, `replay_safe`, sensibilidade, fronteiras. |
| `shadow_support_matrix` | Por nó: `supports_shadow`, `execution_kind`. |
| `advisory_execution_matrix` | Ponte advisory / scheduler MVP. |
| `runtime_recovery_matrix` | Marcações reservadas 4.12.6+ (`runtime_recovery_supported: false`). |
| `scheduler_compatibility_matrix` | Compatibilidade com scheduler serial 4.12.3. |
| `diagnostics` | Resultado de validações (`validation_ok`, erros, avisos, contagens). |
| `created_at` | ISO timestamp. |

## Validações (diagnostics)

- Adapter **duplicado** (mesmo `node_id` duas vezes).
- Nó do grafo **sem** adapter ou adapter **órfão** (não está no grafo).
- Contrato em falta (`getContract` inválido).
- **Inconsistência** `replay_safe` vs `supports_replay`.
- Aviso quando `supports_replay` + `replay_sensitivity: high` sem `replay_safe` (edge case).

## Limitações (4.12.5)

- Sem execução DAG real, sem substituir `orchestration.js`, sem replay automático, sem paralelismo, sem scheduler real, sem event-driven.
- Contratos e matrizes são **declarativos**; não validam ficheiros em disco nesta fase.
- O pipeline oficial **não lê** o artefacto; falhas de escrita são silenciadas (ou log com `SETUP_BOSS_EXECUTION_GRAPH_DEBUG=1`).

## Preparação 4.12.6+ (replay runtime)

- Contratos estabelecem **fronteiras** (`deterministic_boundaries`, artefactos esperados) para futura ligação ao `emitBridge` / replay sem duplicar a orquestração.
- `replay_support_matrix` e `runtime_contracts` alimentam evolução incremental.

## Testes

```bash
node --test scripts/runtime/graph/node-adapters/node-adapters.test.js
```

Incluído também em `npm test`.

## Ver também

- `docs/execution-graph-runtime/execution-node-mapping.md`
- `docs/execution-graph-runtime/phase-4-12-1-execution-graph-model.md` … `phase-4-12-4-pipeline-overlay-mode.md`
