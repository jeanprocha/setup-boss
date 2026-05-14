# Fase 4.12.4 — Pipeline Overlay Mode

## Objetivo

Camada **advisory** que consolida **observabilidade** entre:

1. Ordem **linear** inferida a partir de `runtime-checkpoints.json` (+ presença de artefactos canónicos por nó, 4.12.1).
2. Ordem **determinística do DAG** (`graph.edges`, sem `repeat_edges` no scheduling).
3. Ordem **advisory do scheduler** 4.12.3 (`execution-graph-scheduler-report.json` ou simulação em memória).
4. Transições em **`execution-graph-runtime.json`** (tipicamente snapshot inicial sem `transitions` em shadow 4.12.2).
5. **Artefactos esperados** por `node` no modelo estrutural.

Sem alterar `orchestration.js`, sem controlar o pipeline, sem bloquear execução.

## Arquitetura (resumo)

```text
scripts/runtime/graph/overlay/
  linear-collector.js      — ordem linear observada (checkpoints + artefactos)
  comparison-validators.js — fingerprints, monotonia linear vs DAG, duplicados scheduler
  consistency-analyzer.js  — overlay_status, avisos, resumo de divergências
  overlay-engine.js        — orquestra carregamento + modelo derivado
  overlay-report-builder.js— execution-graph-overlay-report.json
  artifact-writer.js
  feature-flags.js         — SETUP_BOSS_EXECUTION_GRAPH_OVERLAY
  shadow-hook.js           — tryWriteShadowOverlayReport (best-effort)
```

Integração: `tryWriteShadowExecutionGraphArtifacts` (pós-run em `run-runtime.js`) chama também o hook do overlay quando a flag está em `shadow`.

## Comparação advisory

- **Linear vs DAG:** cada nó na sequência linear deve respeitar **índices monótonos** na `graph_deterministic_order`. Repetições (ex.: segundo `AFTER_EXECUTOR` após correction loop) **não** são modeladas no DAG single-pass → `overlay_status: warning` com código `linear_order_non_monotone_due_to_pipeline_loop` quando há repetições “tipo loop” (executor/correction/review).
- **Scheduler vs DAG:** `executed_nodes` do relatório 4.12.3 deve coincidir com a ordem determinística completa; caso contrário → `warning` (`scheduler_order_mismatch`), exceto quando já `divergent` por fingerprint.
- **Fingerprints:** `execution-graph-runtime.json` e `execution-graph.json` (se existirem) devem alinhar com o grafo canónico.

## Modelo de consistência

| `overlay_status` | Situação típica |
|------------------|-----------------|
| `consistent` | Fingerprints ok, scheduler = DAG, linear monótona, sem órfãos, scheduler single-pass. |
| `warning` | Relatório scheduler errado vs DAG; linear com loop real vs DAG single-pass; runtime sem `transitions` mas scheduler advisory presente; etc. |
| `divergent` | Fingerprint inválido; nós órfãos na linear; **duplicados** na sequência advisory do scheduler on-disk. |

## Artefacto: `execution-graph-overlay-report.json`

| Campo | Conteúdo |
|-------|----------|
| `schema_version` | Inteiro. |
| `run_id` | ID da corrida. |
| `graph_id` / `graph_fingerprint` | Derivados do grafo canónico. |
| `overlay_mode` | `shadow` quando gerado pelo hook. |
| `overlay_status` | `consistent` \| `warning` \| `divergent`. |
| `linear_pipeline_order` | Sequência de `node_id` observada (pode repetir em loops). |
| `graph_deterministic_order` | Ordem topológica do DAG (edges). |
| `scheduler_execution_order` | Do ficheiro 4.12.3 ou fallback em memória. |
| `node_comparison` | Por nó: presença na linear, artefacto principal existente. |
| `dependency_analysis` | Contagens de arestas + `repeat_edges` (informativo). |
| `transition_analysis` | Contagens runtime vs referência advisory. |
| `consistency_summary` | Flags resumidas. |
| `divergence_summary` | Entradas estruturadas com `code` + detalhe. |
| `warnings` | Lista de avisos não fatais. |
| `diagnostics` | Collector linear, fases de checkpoint, ficheiros carregados, validação fingerprint. |
| `created_at` | ISO. |

## Limitações (4.12.4)

- Ordem linear é **inferida** (checkpoints macro, não substitui instrumentação fina).
- `AFTER_PREFLIGHT` não mapeia para nós do grafo 4.12.1.
- `repeat_edges` (correction→executor) não aparecem como arestas na ordem determinística do scheduler 4.12.3 — loops reais geram **warnings** esperados.
- Não lê `emitBridge` nem telemetria — apenas ficheiros no `outputDir`.

## Flags

| Variável | Valores |
|----------|---------|
| `SETUP_BOSS_EXECUTION_GRAPH_OVERLAY` | `off` (default) \| `shadow` |

Debug: `SETUP_BOSS_EXECUTION_GRAPH_DEBUG=1` — aviso em falha de escrita.

## Próximos passos (4.12.5+)

- Ponte opcional com eventos `emitBridge` / checkpoints adicionais (sem refactor do orquestrador).
- Heurísticas condicionais (`review_approved` vs `review_requires_correction`) alinhadas a artefactos reais.
- Redação de caminhos em diagnostics (política PII).

## Ver também

- `docs/execution-graph-runtime/phase-4-12-1-execution-graph-model.md`
- `docs/execution-graph-runtime/phase-4-12-2-graph-state-runtime.md`
- `docs/execution-graph-runtime/phase-4-12-3-graph-scheduler-mvp.md`
- `docs/execution-graph-runtime/graph-overlay-discovery.md`
