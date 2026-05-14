# Fase 4.12.8 — Graph Risk / Deadlock Detection

**Assumido:** discovery 4.12, DAG, graph model, runtime state, scheduler advisory, overlay, replay, observabilidade (leitura de artefactos quando existem).

**Objetivo:** análise **read-only** de risco e integridade operacional do DAG (ciclos, órfãos, cadeias blocked, sinais de deadlock/retry/replay, fingerprints, transições).

**Implementar:**

- `risk-analyzer` (agregação + `overall_risk_level` + `detected_risks`)
- `deadlock-detector` (scheduler stuck + cadeias upstream blocked/pending)
- `cycle-validator` (ciclos hard + scheduling `edges`)
- `replay-loop-detector` (diagnostics replay + gerações inconsistentes)
- `integrity-validator` (refs de arestas, órfãos-fonte inesperados, unreachable desde scan, doc `execution-graph.json`, fingerprints)
- `risk-report-builder` + `artifact-writer` + `shadow-hook` (`tryWriteShadowRiskReport`)
- `safe-json` (leituras tolerantes a falhas)
- testes `risk.test.js`

**Níveis:** `low` | `medium` | `high` | `critical`.

**Categorias (em `detected_risks[].category`):** `graph_integrity` | `runtime_consistency` | `replay_consistency` | `dependency_resolution` | `scheduler_consistency` | `transition_consistency`.

**Flag:** `SETUP_BOSS_EXECUTION_GRAPH_RISK=off|shadow` (default **off**).

**Artefacto:** `execution-graph-risk-report.json` — campos mínimos: `schema_version`, `run_id`, `graph_id`, `graph_fingerprint`, `overall_risk_level`, `detected_risks`, `deadlock_analysis`, `cycle_analysis`, `replay_loop_analysis`, `orphan_analysis`, `blocked_chain_analysis`, `integrity_summary`, `runtime_safety_diagnostics`, `diagnostics`, `warnings`, `created_at` (+ `risk_mode`, `compat`).

**Artefactos opcionais lidos (degradação graciosa):** `execution-graph.json`, `execution-graph-runtime.json`, `execution-graph-scheduler-report.json`, `execution-graph-overlay-report.json`, `execution-graph-node-adapters.json`, `execution-graph-replay-report.json`.

**Não:** alterar `orchestration.js`; bloquear execução; alterar replay/scheduler; executar DAG real; paralelismo.

**Testes:** ciclos, órfãos, deadlock signal, replay loop, blocked chain, transições inválidas, degradação, fingerprint mismatch, flag off/shadow, geração de relatório, pipeline intacto; em `npm test`.

**Critério:** pipeline oficial intacto; risk só leitura; relatório derivado; integração na shadow layer.
