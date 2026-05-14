# Fase 4.12.6 — Graph Replay Runtime

Implementar **replay advisory** (planeamento apenas): subárvore, invalidação downstream, ordem determinística, gerações, capability matrix, relatório derivado.

**Infraestrutura já existente** (assumida): graph model, runtime state, scheduler advisory, overlay, node adapters, fingerprints, contratos.

**Objetivo:** modelo de replay **simulado** — sem executar pipeline nem handlers.

**Implementar:**

- replay planner (`planGraphReplay`)
- subtree resolver (downstream em `edges`; **sem** expansão automática por `repeat_edges`)
- invalidation engine (`dependency_invalidation`, dependentes abaixo dos alvos)
- replay validators (alvo, fingerprint, runtime↔grafo, ciclo, ordem vs `deterministic_order`)
- replay report builder + artifact writer
- shadow hook pós-run (`tryWriteShadowReplayReport`)

**Criar:** `scripts/runtime/graph/replay/` (módulos listados no código; testes `replay.test.js`).

**Estados / conceitos (resumo):** `replay_optional`, `replay_blocked`, `replay_required`, `replay_boundary`, `replay_safe`; `replay_capability_matrix` a partir dos adapters.

**Flag:** `SETUP_BOSS_EXECUTION_GRAPH_REPLAY=off|shadow` (default **off**).

**Opcional env:** `SETUP_BOSS_EXECUTION_GRAPH_REPLAY_TARGETS`, `SETUP_BOSS_EXECUTION_GRAPH_REPLAY_BOUNDARY_STOPS`.

**Artefacto:** `execution-graph-replay-report.json` no `outputDir` da run (`schema_version`, `run_id`, `graph_id`, `graph_fingerprint`, `replay_mode`, alvos, subárvore, invalidados, ordem, gerações, nós safe/blocked, fronteiras, matriz, `dependency_invalidation`, `diagnostics`, `replay_blockers`, `warnings`, `created_at`, `compat` com meta advisory).

**Não:** alterar `orchestration.js`; executar DAG real; paralelismo; scheduler/event-driven operacional; reescrever correction/review/validation/orchestration semantics.

**Testes:** replay único/subárvore, invalidação, ordem determinística, boundary, blocked/capability matrix, gerações, alvo inexistente, flag off/shadow, fingerprint mismatch, overlay intacto; incluídos em `npm test`.

**Critério:** pipeline oficial intacto; replay só planeamento/diagnóstico; integração isolada na shadow layer.

**Detalhe de discovery:** `docs/execution-graph-runtime/graph-replay-discovery.md`. **Seguinte:** observabilidade consolidada (ex. 4.12.7).
