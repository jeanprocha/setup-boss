# Setup Boss — Evolução do projeto

## Objetivo

Registar a evolução real do sistema por fase, **sem descrever comportamento que não exista no código**.

---

## Fase 1 — MVP (histórico)

- **Architect** e plano textual
- Alterações no repo **fora do orquestrador** (sem executor integrado)
- **Sem** executor automático no pipeline

---

## Fase 2 — Semi-automação

- **Review** com decisão em **`review-output.json`**
- Loop **correction** com instruções para a volta seguinte
- **`run-log.json`** e limites (**`MAX_CORRECTIONS`**, **`MAX_TOTAL_STEPS`**)
- Cache de scan (**`ENABLE_SCAN_CACHE`**)
- Knowledge estruturado por projeto (**`.setup-boss/knowledge-base.md`**)

Pipeline típico **antes** do executor integrado:

```text
scan → architect → (alterações fora do executor, histórico) → review → correction → …
```

---

## Fase 3.1 — Daemon local, fila e worker único (Node)

Implementação inicial do runtime persistente em Node, **sem** migração Go, sem multi-worker e sem API remota.

- Daemon **`scripts/daemon/setup-bossd.js`** (processo persistente) com estado em **`.setup-boss/daemon/`** (`pid`, `status.json`, `daemon.log`, `queue.json`)
- Worker **único** que executa **`node scripts/run.js …`** como subprocesso (**reuso total** da pipeline; `process.exit` no processo-filho não afeta o daemon)
- Fila persistente **`queue.json`**; comandos **`setup-boss daemon …`**, **`enqueue`**, **`queue`**
- **Lock por projeto** em **`.setup-boss/locks/<hash>.lock`**, também no caminho **`run`** / **`resume`** do CLI (**`replay`/`apply`/execuções directas `npm run run` escapam ainda ao lock nesta sub-fase — ver roadmap**)

---

## Fase 3 — Executor local (**v2.0.0**, estado atual)

Inclui o comportamento **atual** do repositório:

- **Executor automático** com resposta estruturada **PATCH** (`operation: patch`): **`search`** com uma única ocorrência no ficheiro, **`replace`**; validação e escrita em **`scripts/executor.js`**
- **`run-context.json`** gerado pelo **architect** (`buildRunContext` em **`scripts/architect.js`**) com **`allowed_files`**, resumo da task, critérios e foco de review
- **Pipeline completo** orquestrado por **`npm run run`**:

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

- **Review** com uso preferencial de **`run-context.json`** quando válido, reduzindo dependência de colar task/scan/architect completos
- Memória **`.IA`** e knowledge no projeto alvo
- **Modelos por etapa** (`core/llm-client.js`)
- **Métricas**: **`core/llm-usage.js`**; **`metadata.json`** com **`llm_usage`** e **`llm_usage_total`**; inclui etapas auxiliares (**`ensure_ia`**, **`semantic_ia`**) quando disparadas no fluxo

---

## Fase 4 — Executor híbrido e validação mais forte

- Mais caminhos determinísticos onde o projeto permitir
- Parsing estruturado onde couber
- Validação opcional (build/test) com infraestrutura disponível

### Fase 4.8 — Semantic Dependency Runtime (estável)

- Core: `dependency-graph.json`, snapshots, overlay `semantic-mutation-graph.json` / `propagation-manifest.json`, diagnóstico `semantic-diagnostics.json`.
- Integrações **shadow / report-only** com validation-targeting, risk, review e correction via variáveis `SETUP_BOSS_*_SEMANTIC_PROPAGATION` (defeito `off`).
- Continuidade replay-safe com governança: `governance-semantic-continuity.js` e testes associados.

Referência: **`docs/semantic-runtime-phase48.md`**.

### Fase 4.9 — Hybrid Executor Runtime (concluída / estável)

- **Structural-first + fallback textual** quando o gate MVP falha (`scripts/hybrid-executor`, flags em `feature-flags.js`; defeito **OFF**).
- Shadows incrementais: AST read-only (4.9.1), planning (4.9.2), transforms (4.9.3); execução híbrida (4.9.4); apply estrutural controlado opcional (4.9.5).
- **Governança** estrutural em relatório JSON (4.9.6); **fundação replay** fingerprints/lineage/stale (4.9.6.1); **replay shadow** e continuidade sem apply real (4.9.7).
- **Observabilidade** consolidada: `hybrid-runtime-summary.json` quando `HYBRID_RUNTIME_OBSERVABILITY_ENABLED` (4.9.7.1).
- **Encerramento documental e release readiness** (4.9.8): matriz de flags + consistência operacional documentada.

Referências cruzadas: **`docs/hybrid-runtime-lifecycle.md`**, **`docs/hybrid-runtime-release-readiness.md`**, **`docs/observability.md`**.

**Limitações MVP herdadas:** sem replay apply real ao disco; sem propagação semântica global nem transação multi-ficheiro unificada neste runtime.

### Fase 4.10 — Validation Runtime (concluída / estável em shadow)

- **Plano declarativo** (`validation-plan.json`), **resolver** de comandos a partir do projeto alvo, **executor** local síncrono, **cache** (`validation-cache.json`, entradas passed-only), **summary** (`validation-runtime-summary.json`).
- **Dependency graph** MVP (`dependency-graph.json`) e **impact expansion** nos targets; **graph-aware planning** no plano (`graph_impact`, `graph_candidates`, `risk_hints`, `scope_expansion`) sem alterar comandos resolvidos.
- **Gating:** `SETUP_BOSS_PLAN_MODE=shadow`; propagação semântica opcional `SETUP_BOSS_SEMANTIC_VALIDATION_PROPAGATION=shadow`.
- **Encerramento:** **`docs/validation-runtime-phase410-release-readiness.md`**.

### Fase 4.11 — Deterministic Review Runtime (concluída / estável)

- **`deterministic-review.json`** — findings estruturais + semantic light + validation/cache/graph; **`risk_summary`**; campo **`gate`** (observacional no fingerprint).
- **Gate 4.11.5** — `SETUP_BOSS_REVIEW_GATE_MODE` / `THRESHOLD` (default não bloqueante).
- **Diff 4.11.6** — `review-diff.json` via `inspect-review --diff` (+ `--write-diff`).
- **Baseline 4.11.7** — `review-baseline-summary.json`; `SETUP_BOSS_REVIEW_BASELINE_*` (baseline ausente não aborta pipeline).
- **Encerramento 4.11.8:** **`docs/deterministic-review-phase411-release-readiness.md`** (checklist, CI, limitações MVP).

### Fase 4.12.3 — Graph Scheduler MVP (advisory / serial)

- **`execution-graph-scheduler-report.json`** — simulação **serial** de prontidão e transições; **sem** handlers de etapa, **sem** paralelismo; **`repeat_edges`** só documentadas (`skipped_repeat_edges`), não entram no grafo de dependências do scheduler.
- Flag: **`SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER`** `off` (default) \| **`shadow`**; integração via `tryWriteShadowExecutionGraphArtifacts` (best-effort).
- Referência: **`docs/execution-graph-runtime/phase-4-12-3-graph-scheduler-mvp.md`**.

### Fase 4.12.4 — Pipeline Overlay Mode (advisory)

- **`execution-graph-overlay-report.json`** — compara ordem **linear** (checkpoints + artefactos), ordem **DAG** determinística, relatório **scheduler** 4.12.3 e métricas de **runtime**/**artefactos**; `overlay_status`: consistent | warning | divergent.
- Flag: **`SETUP_BOSS_EXECUTION_GRAPH_OVERLAY`** `off` (default) \| **`shadow`**; integração em `tryWriteShadowExecutionGraphArtifacts` (best-effort).
- Referência: **`docs/execution-graph-runtime/phase-4-12-4-pipeline-overlay-mode.md`**.

### Fase 4.12.5 — Runtime Node Adapters (metadados)

- **`execution-graph-node-adapters.json`** — registo determinístico de **descritores** por `node_id`, **contratos de execução** (API estática), **matrizes** replay/shadow/advisory/recovery/scheduler; não altera `orchestration.js` nem invoca runtimes de etapa.
- Flag: **`SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS`** `off` (default) \| **`shadow`**; integração em `tryWriteShadowExecutionGraphArtifacts` (best-effort).
- Referência: **`docs/execution-graph-runtime/phase-4-12-5-runtime-node-adapters.md`**.

### Fase 4.12.6 — Graph Replay Runtime (advisory / planeamento)

- **`execution-graph-replay-report.json`** — planeamento de **subárvore** e **invalidação downstream** (arestas de scheduling apenas), **ordem determinística** alinhada ao scheduler 4.12.3, **gerações** de replay, **matriz de capacidade** dos adapters; **sem** executar pipeline nem handlers.
- Flag: **`SETUP_BOSS_EXECUTION_GRAPH_REPLAY`** `off` (default) \| **`shadow`**; opcional **`SETUP_BOSS_EXECUTION_GRAPH_REPLAY_TARGETS`**, **`SETUP_BOSS_EXECUTION_GRAPH_REPLAY_BOUNDARY_STOPS`**.
- Referência: **`docs/execution-graph-runtime/phase-4-12-6-graph-replay-runtime.md`**.

### Fase 4.12.8 — Graph Risk / Deadlock Detection (read-only)

- **`execution-graph-risk-report.json`** — agregação de riscos (ciclos, órfãos, integridade, scheduler stuck, replay loop, transições, overlay, retry storm); **sem** bloquear pipeline.
- Flag: **`SETUP_BOSS_EXECUTION_GRAPH_RISK`** `off` (default) \| **`shadow`**; integração em `tryWriteShadowExecutionGraphArtifacts` (best-effort).
- Referência: **`docs/execution-graph-runtime/phase-4-12-8-graph-risk-deadlock-detection.md`**.

### Fase 4.12.9 — Release Readiness (encerramento 4.12)

- **`execution-graph-release-readiness.json`** — `release_status` `ready` \| `warning` \| `blocked`; auditorias (`artifact_audit`, `feature_flag_audit`, `integration_audit`, `consistency_audit`, `compatibility_audit`), `diagnostics` consolidados, `warnings` / `blockers`; leitura JSON tolerante e readiness **parcial** se artefactos shadow estiverem ausentes.
- Flag: **`SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS`** `off` (default) \| **`shadow`**; corre **depois** dos outros hooks em `tryWriteShadowExecutionGraphArtifacts` (best-effort).
- Referência: **`docs/execution-graph-runtime/phase-4-12-9-release-readiness.md`**.

---

## Fase 5 — Sistema autónomo (aspiracional)

- Propostas com gates humanos organizacionais
- Execução contínua com salvaguardas

## Fase 3.10 — Estabilização / E2E / documentação

- **`SETUP_BOSS_DATA_DIR`**: estado `.setup-boss` equivalente pode ser isolado no disco (CI/testes sem poluir o checkout).
- **`daemonVersion` 3.10** + **`runtimeVersion`** + **`featureFlags`** em `status.json`; **`runningJobsCount`** alinhado ao pool em disco.
- **`writeDaemonStatus`**: patches parciais (ex.: só `scheduler`) preservam `daemonVersion`, `workerList`, `processedJobs`, etc.
- **Shutdown**: intervalos globais (stuck poll + scheduler) são limpos antes de fechar a Runtime API.
- **Runtime API**: `SETUP_BOSS_RUNTIME_API_REQUEST_TIMEOUT_MS` define timeout de pedido ao servidor HTTP.
- **`setup-boss doctor --fix-safe`**: remoção conservadora de locks stale/corruptos e pid órfão.
- **`scripts/run.js`**: modo **`SETUP_BOSS_E2E_WORKER_NOOP`** para integração sem LLM (só quando definido).
- **Testes E2E reais**: `scripts/tests/e2e/daemon-runtime.e2e.test.js` (daemon subprocess + HTTP + fila).
- **Documentação**: `docs/phase3-runtime-readiness.md`, atualizações em guia operacional e troubleshooting.

---

## Estado atual

```text
Fase 3 concluída nas funcionalidades principais (v2.0.0):
run-context, PATCH, métricas LLM (llm_usage), redução de contexto entre etapas.

Fase 4.9 (Hybrid Executor Runtime) concluída e estável para uso controlado por flags:
lifecycle em docs/hybrid-runtime-lifecycle.md; encerramento e rollout em
docs/hybrid-runtime-release-readiness.md.

Fase 4.10 (validation runtime em shadow) concluída: docs/validation-runtime-phase410-release-readiness.md

Fase 4.11 (deterministic review: evidências, risco, gates opcionais, diff/baseline) concluída:
docs/deterministic-review-phase411-release-readiness.md

Fase 4.12.1–4.12.6, 4.12.8 (execution graph, runtime state, scheduler advisory, pipeline overlay, node adapters, replay advisory, risk read-only): docs/execution-graph-runtime/phase-4-12-1-execution-graph-model.md, phase-4-12-2-graph-state-runtime.md, phase-4-12-3-graph-scheduler-mvp.md, phase-4-12-4-pipeline-overlay-mode.md, phase-4-12-5-runtime-node-adapters.md, phase-4-12-6-graph-replay-runtime.md, phase-4-12-8-graph-risk-deadlock-detection.md

Próximo foco contínuo: docs/setup-boss-roadmap.md (STEP 4–7: tokens, fallback, híbrido, targeting 4.12+).
```
