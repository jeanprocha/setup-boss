# Setup Boss — Roadmap

## Pipeline em produção

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

O comando **`npm run run`** automatiza até **knowledge** quando o review fica **`approved`**. Se o review pedir correção, o ciclo **correction → executor → review** repete até aprovação, **`blocked`**, ou limites (**`MAX_CORRECTIONS`**, **`MAX_TOTAL_STEPS`**) em **`scripts/run.js`**.

---

## Concluído (estado atual do código)

- **MVP Fase 1 — Task intake & discovery runtime** — `npm run intake` / `scripts/intake.js`; discovery + classificação + `intake-manifest.json`; índice global com **`run_type: intake`**; flags **`--skip-llm`** e **`--json`**; validação **`validateIntakeArtifacts`**; smoke **`npm run smoke:mvp-phase1-intake`**; documentação **`docs/mvp-phase1-task-intake-discovery-runtime.md`**.
- **MVP Fase 2 — Clarification runtime (pós-intake)** — `npm run clarify` / `scripts/clarify.js`; sessão, perguntas, respostas, **`task-plan-refined.md`**, **`approval-state.json`**; `run-context.phase2` até **`ready_for_execution`**; flags **`--skip-llm`**, **`--json`**, **`--answers`**, **`--answer`**, **`--refine`**, **`--approve`** / **`--reject`**; validação **`validateClarificationArtifacts`**; smoke **`npm run smoke:mvp-phase2-clarification`**; documentação **`docs/mvp-phase2-clarification-runtime.md`**.
- **MVP Fase 3 — Strategy runtime (pós-clarificação, concluída)** — `npm run strategy` / `scripts/strategy.js`; após **`ready_for_execution`** + aprovação: pasta **`strategy/`** com análise de complexidade, recomendação IA, decomposição, ordem linear, contexto partilhado, readiness, **`execution-ready-handoff.json`** (handoff único para fases futuras) e **`strategy-diagnostics.json`**; **`--run`**, **`--force`**, **`--json`**; validação **`validateStrategyArtifacts`**; **não executa código** do projeto alvo; documentação **`docs/mvp-phase3-execution-strategy-runtime.md`** (estabilização **3.9**: docs + exemplos de comando/teste).
- **`run-context.json`** — gerado pelo architect; inclui task resumida, **`allowed_files`**, critérios de aceite, **`review_focus`**, estado do architect (**`scripts/architect.js`**).
- **Executor por PATCH** — schema com **`operation: patch`**; **`search`** deve ocorrer **exactamente uma vez** no ficheiro alvo; escopo limitado a **`allowed_files`** (**`scripts/executor.js`**).
- **Review JSON-first** — **`review-output.json`**; uso de **run-context** quando válido para prompts mais curtos (**scripts/review.js** e leitura de artefactos).
- **Modelos por etapa** — **`core/llm-client.js`**, variáveis **`ARCHITECT_MODEL`**, **`EXECUTOR_MODEL`**, etc., fallback **`OPENAI_MODEL`**.
- **Tracking** — **`core/llm-usage.js`**; **`metadata.json`** com **`llm_usage`** (por chave de etapa) e **`llm_usage_total`** em **`<projeto>/docs/.IA/outputs/<run>/`** (legado: **`<projeto>/.IA/outputs/<run>/`**); inclui **`scan`**, **`ensure_ia`**, **`semantic_ia`** quando aplicável ao fluxo.
- **Fase 4.9 — Hybrid Executor Runtime** — ramo **opt-in** no executor: structural-first com **fallback textual**, relatórios de governança/replay **shadow**, observabilidade consolidada; marco **encerrado** documentalmente (**`docs/hybrid-runtime-release-readiness.md`**, **`docs/hybrid-runtime-lifecycle.md`**).
- **Fase 4.10 — Validation Runtime (execução local / plano declarativo)** — `validation-plan.json`, executor sync, cache passed-only, summary, `dependency-graph.json`, planning graph-aware em metadatos; **encerrada** em **`docs/validation-runtime-phase410-release-readiness.md`**.
- **Fase 4.11 — Deterministic Review Runtime** — `deterministic-review.json`, `risk_summary`, gates opcionais (risco + baseline), diff/baseline via CLI; **encerrada** em **`docs/deterministic-review-phase411-release-readiness.md`** (observacional por defeito).
- **Fase 4.12.1 — Execution Graph Model** — modelo estrutural + `execution-graph.json` em modo **shadow** (`SETUP_BOSS_EXECUTION_GRAPH`); **sem** scheduler nem mudanças em `orchestration.js`. Ver **`docs/execution-graph-runtime/phase-4-12-1-execution-graph-model.md`**.
- **Fase 4.12.2 — Graph State Runtime** — `execution-graph-runtime.json` (estado por nó, transições validadas, snapshot inicial em shadow — `SETUP_BOSS_EXECUTION_GRAPH_RUNTIME`). Ver **`docs/execution-graph-runtime/phase-4-12-2-graph-state-runtime.md`**.
- **Fase 4.12.3 — Graph Scheduler MVP** — scheduler **serial** + relatório **`execution-graph-scheduler-report.json`** em modo **shadow** (`SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER`); advisory-only. Ver **`docs/execution-graph-runtime/phase-4-12-3-graph-scheduler-mvp.md`**.
- **Fase 4.12.4 — Pipeline Overlay Mode** — comparação linear vs DAG + relatório **`execution-graph-overlay-report.json`** em modo **shadow** (`SETUP_BOSS_EXECUTION_GRAPH_OVERLAY`); advisory-only. Ver **`docs/execution-graph-runtime/phase-4-12-4-pipeline-overlay-mode.md`**.
- **Fase 4.12.5 — Runtime Node Adapters** — adapters finos (descritores + contratos + capability matrix) + artefacto derivado **`execution-graph-node-adapters.json`** em modo **shadow** (`SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS`); **sem** invocar `scan`/`executor`/etc. Ver **`docs/execution-graph-runtime/phase-4-12-5-runtime-node-adapters.md`**.
- **Fase 4.12.6 — Graph Replay Runtime (advisory)** — planeamento de subárvore, invalidação downstream e relatório **`execution-graph-replay-report.json`** em modo **shadow** (`SETUP_BOSS_EXECUTION_GRAPH_REPLAY`); **sem** executar pipeline nem handlers. Ver **`docs/execution-graph-runtime/phase-4-12-6-graph-replay-runtime.md`**.
- **Fase 4.12.8 — Graph Risk / Deadlock Detection** — análise read-only (ciclos, órfãos, blocked, replay/scheduler/runtime) + **`execution-graph-risk-report.json`** em modo **shadow** (`SETUP_BOSS_EXECUTION_GRAPH_RISK`). Ver **`docs/execution-graph-runtime/phase-4-12-8-graph-risk-deadlock-detection.md`**.
- **Fase 4.12.9 — Execution Graph Release Readiness** — validação consolidada (integridade, fingerprints, flags, isolamento shadow) + **`execution-graph-release-readiness.json`** em modo **shadow** (`SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS`); **encerra** a 4.12 como camada **advisory**. Ver **`docs/execution-graph-runtime/phase-4-12-9-release-readiness.md`**.
- **Fluxo Git Mission Control (fases 1–11, concluído)** — prepare branch, execute gate, commit pós-review, push/PR opcionais (Bitbucket), smoke **`npm run smoke:git-flow-e2e`**; runbook **`docs/git-workflow-operational-runbook.md`**.

---

## Próximos passos declarados

### STEP 4 — Optimização agressiva de tokens

- Reduzir texto redundante entre etapas dentro do que o contrato dos artefactos permitir.
- Políticas de truncagem e resumos alinhadas aos consumidores existentes.

### STEP 5 — Fallback inteligente (local/API)

- Caminhos locais determinísticos onde fizer sentido.
- API só onde o ganho compensar custo e complexidade.

### STEP 6 — Executor híbrido (evolução contínua)

- A **linha base** da Fase **4.9** está **entregue e estável sob uso controlado** (flags, artefactos, release readiness — ver **`docs/hybrid-runtime-release-readiness.md`**).
- **Seguinte:** mais edições guiadas por estrutura (marcadores, slots), parsing mais rígido por stack, e extensões **fora** do MVP actual (ex.: cobertura semântica / transacções), sempre preservando invariantes de PATCH e **`allowed_files`**.

### STEP 7 — Pós 4.10 / 4.11 (targeting e impacto)

- As fases **4.10** e **4.11** estão **fechadas** (**`docs/validation-runtime-phase410-release-readiness.md`**, **`docs/deterministic-review-phase411-release-readiness.md`**).
- **Seguinte (4.12+):** overlays de impacto vs execução, inspecção cruzada candidatos ↔ resultados / findings, evolução opcional do grafo sem tornar o executor obrigatoriamente dependente dele (ver **`docs/validation-targeting-phase412.md`** quando aplicável). **4.12.1** modelo + **`execution-graph.json`**; **4.12.2** estado + **`execution-graph-runtime.json`**; **4.12.3** scheduler **advisory** + **`execution-graph-scheduler-report.json`**; **4.12.4** overlay **advisory** + **`execution-graph-overlay-report.json`**; **4.12.5** adapters + **`execution-graph-node-adapters.json`**; **4.12.6** replay **advisory** + **`execution-graph-replay-report.json`**; **4.12.8** risk **read-only** + **`execution-graph-risk-report.json`** (ver **`docs/execution-graph-runtime/phase-4-12-1-execution-graph-model.md`**, **`docs/execution-graph-runtime/phase-4-12-2-graph-state-runtime.md`**, **`docs/execution-graph-runtime/phase-4-12-3-graph-scheduler-mvp.md`**, **`docs/execution-graph-runtime/phase-4-12-4-pipeline-overlay-mode.md`**, **`docs/execution-graph-runtime/phase-4-12-5-runtime-node-adapters.md`**, **`docs/execution-graph-runtime/phase-4-12-6-graph-replay-runtime.md`**, **`docs/execution-graph-runtime/phase-4-12-8-graph-risk-deadlock-detection.md`**).

---

## Regras de evolução

- Manter invariantes dos consumidores de artefactos (**`review-output.json`**, **`executor-changes.json`**, etc.) salvo migração explícita.
- Review continua no caminho padrão antes de knowledge com aceitação.
- Não expandir escrita automática para fora do whitelist da corrida (**`allowed_files`**).

---

## Critério de sucesso (contínuo)

- Execução end-to-end até knowledge **sem passo manual de edição** no mesmo run quando não há bloqueio.
- Custos e tokens observáveis por etapa nos artefactos da corrida.
- Menos tokens por run mantendo critérios de aceite atendidos em tasks válidas.
