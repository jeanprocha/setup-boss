# Changelog — Alterações não commitadas

> Gerado em 14/05/2026. Cobre todos os arquivos em estado `??` (novos) e `M` (modificados) no working tree.

---

## Resumo executivo

Esta entrega representa a construção completa do **runtime de execução do setup-boss**, evoluindo de um conjunto de scripts pontuais para um sistema multi-camada com daemon, CLI, grafo de execução, recovery, replay, governança e validação semântica. Abrange ~13 módulos novos, ~22 comandos de CLI e centenas de arquivos de implementação e testes.

---

## 1. Entrypoints de alto nível (scripts raiz)

| Arquivo | Descrição |
|---|---|
| `scripts/apply.js` | Aplica patches gerados em runs anteriores (apply-later flow) |
| `scripts/replay.js` | Reexecuta um run a partir de um checkpoint |
| `scripts/resume.js` | Retoma uma run pausada aguardando aprovação (HITL) |
| `scripts/patch-content.js` | Utilitário de manipulação de conteúdo de patch |
| `scripts/shared-utils.js` | Utilitários compartilhados entre scripts |

**`package.json`** recebeu novos scripts: `resume`, `apply-later`, `replay`, `setup-boss` (CLI), `test:e2e`, `validate:artifacts`, `test:continuity`, `test` (suite completa) e `build`. Adicionada dependência `@babel/parser`. Adicionado campo `bin` expondo o CLI como executável `setup-boss`.

---

## 2. CLI (`scripts/cli/`)

Interface de linha de comando completa para operação do sistema.

### Comandos implementados

| Comando | Função |
|---|---|
| `status` | Status operacional do sistema |
| `list` | Lista runs registradas |
| `inspect` | Inspeciona uma run pelo ID |
| `inspect-plan` | Exibe o plano de execução de uma run |
| `inspect-review` | Exibe o resultado de review de uma run |
| `inspect-risk-analysis` | Exibe análise de risco |
| `inspect-transaction` | Exibe estado transacional |
| `inspect-correction` | Exibe correções aplicadas |
| `inspect-validation-runtime` | Exibe resultado de validação |
| `inspect-validation-targets` | Exibe alvos de validação |
| `semantic-inspect` | Inspeção semântica de dependências |
| `governance-inspect` | Inspeciona estado de governança |
| `queue` | Gerencia fila de trabalho do daemon |
| `enqueue` | Enfileira uma nova tarefa |
| `retry` | Reexecuta uma run falha |
| `daemon` | Controla o daemon (start/stop/status) |
| `doctor` | Diagnóstico do ambiente |
| `plan-doctor` | Diagnóstico de planos |
| `watch` | Modo watch para monitoramento em tempo real |
| `projects` | Gerencia projetos registrados |
| `maintenance` | Operações de manutenção (limpeza, compactação) |

### Bibliotecas internas (`scripts/cli/lib/`)

- `failure-diagnostics.js` — formatação de erros de run
- `governance-cli.js` — helpers de governança para o CLI
- `json-io.js` — I/O seguro de JSON
- `operational-status.js` — agregação de status operacional
- `paths.js` — resolução de caminhos do sistema
- `run-summarize.js` — sumário de runs
- `runs-discovery.js` — descoberta de runs no filesystem
- `runtime-api-client.js` — cliente HTTP para o daemon

### Renderização (`scripts/cli/render/`)

- `ansi.js` — helper de cores e estilos ANSI
- `table.js` — renderização de tabelas no terminal

---

## 3. Daemon (`scripts/daemon/`)

Processo de background que orquestra execuções paralelas de projetos.

### Arquivos principais

| Arquivo | Função |
|---|---|
| `setup-bossd.js` | Entry point do daemon |
| `runtime-api.js` | Servidor HTTP REST para controle do daemon |

### Biblioteca do daemon (`scripts/daemon/lib/`)

| Módulo | Função |
|---|---|
| `daemon-log.js` | Logging estruturado do daemon |
| `daemon-paths.js` | Caminhos de artefatos do daemon |
| `daemon-status.js` | Leitura/escrita do arquivo de status |
| `pid-file.js` | Gerenciamento de PID file |
| `project-lock.js` | Lock por projeto (evita execuções concorrentes) |
| `project-registry.js` | Registro de projetos ativos |
| `queue-store.js` | Persistência da fila de trabalho |
| `repo-root.js` | Descoberta da raiz do repositório |
| `runtime-events.js` | Barramento de eventos de runtime |
| `scheduler-loop.js` | Loop principal de scheduling |
| `worker-pool.js` | Pool de workers para execuções paralelas |

---

## 4. Execution Plan (`scripts/execution-plan/`)

Sistema de planejamento estruturado de execução com ciclo de vida, fingerprint e reconciliação.

### Subsistemas

| Diretório | Função |
|---|---|
| `compiler/` | Geração de shadow plans |
| `diagnostics/` | Diagnósticos de plano |
| `diff/` | Diff entre versões de planos |
| `fingerprint/` | Fingerprint de planos para detecção de mudança |
| `lifecycle/` | Motor de ciclo de vida do plano |
| `manifest/` | Manifesto de artefatos do plano |
| `normalization/` | Normalização de operações |
| `persistence/` | Persistência de planos |
| `reconciliation/` | Motor de reconciliação plano vs realidade |
| `schema/` | Constantes e schema |
| `telemetry/` | Telemetria de planos |
| `validation/` | Validação estrutural |
| `validation-targeting/` | Sistema de targeting de validação por dependência |

### Validation Targeting (submódulo crítico)

- `dependency-graph.js` — grafo de dependências entre operações
- `scope-inference.js` — inferência de escopo de validação
- `validator-resolver.js` / `validator-inference.js` — resolução de validadores aplicáveis
- `validation-plan-builder.js` — construção do plano de validação
- `semantic-validation-propagation.js` — propagação semântica de validação
- `graph-aware-plan-enrichment.js` — enriquecimento de plano ciente do grafo
- `validation-cache.js` / `validation-manifest.js` — cache e manifesto
- `validation-observability.js` / `validation-telemetry.js` — observabilidade

---

## 5. Runtime Core (`scripts/runtime/`)

Núcleo do runtime com governança, grafo, preflight, recovery e replay.

### 5.1 Governance (`runtime/governance/`)

Sistema de governança com controle de aprovação humana (HITL) e continuidade semântica.

| Módulo | Função |
|---|---|
| `governance-runtime-hook.js` | Hook de governança no ciclo de execução |
| `governance-approval-runtime.js` | Runtime de aprovação (HITL) |
| `governance-approval-manifest.js` | Manifesto de aprovações pendentes |
| `governance-enforcement-error.js` | Erros de enforcement |
| `governance-validation-enforcement.js` | Enforcement de validação |
| `governance-state-validator.js` | Validação de estado de governança |
| `governance-continuity.js` | Continuidade entre runs |
| `governance-semantic-continuity.js` | Continuidade semântica |
| `governance-continuity-fingerprint.js` | Fingerprint de continuidade |
| `governance-diagnostics-engine.js` | Motor de diagnóstico |
| `governance-runtime-aggregator.js` | Agregação de resultados |
| `policy-engine.js` / `policy-loader.js` | Motor e carregador de políticas |
| `profiles.js` | Perfis de governança |

### 5.2 Execution Graph (`runtime/graph/`)

Grafo de execução DAG com scheduler, overlay de comparação, replay e análise de risco.

| Submódulo | Função |
|---|---|
| `graph-builder.js` | Construção do grafo de execução |
| `scheduler/` | Scheduling baseado em dependências (topological sort) |
| `runtime-state/` | Snapshot e transições de estado do grafo |
| `overlay/` | Overlay de comparação entre execuções |
| `node-adapters/` | Adaptadores por tipo de nó (architect, correction, review, scan, etc.) |
| `replay/` | Replay de subárvores do grafo |
| `risk/` | Detecção de deadlock e ciclos |
| `release-readiness/` | Validação de prontidão para release |

**Node Adapters implementados:** `architect`, `correction`, `execution-plan`, `executor`, `knowledge`, `review`, `scan`, `validation-plan`, `validator-executor`.

### 5.3 Preflight (`runtime/preflight/`)

Análise preventiva antes da execução.

- `analyzer.js` — análise completa de preflight
- `risk-engine.js` — avaliação de risco
- `cost-estimator.js` — estimativa de custo
- `scope-estimator.js` — estimativa de escopo
- `historical-intelligence.js` — inteligência histórica de runs passadas
- `heuristics.js` — heurísticas de qualidade
- `accuracy.js` — métricas de acurácia

### 5.4 Recovery (`runtime/recovery/`)

Sistema de recuperação de falhas com retry inteligente.

- `retry-engine.js` — motor de retry
- `retry-budget.js` — orçamento de tentativas
- `backoff.js` — estratégia de backoff exponencial
- `failure-classifier.js` — classificação de falhas
- `recovery-strategies.js` — estratégias de recuperação por tipo de falha
- `historical-recovery.js` — recovery baseado em histórico
- `executor-recovery-loop.js` — loop de recovery do executor
- `provider-retry.js` — retry específico de provider de IA

### 5.5 Replay (`runtime/replay/`)

Sistema de replay e retomada de execuções.

- `replay-engine.js` — motor de replay
- `resume-engine.js` — retomada de runs pausadas
- `checkpoint-manager.js` — gerenciamento de checkpoints
- `apply-later.js` — aplicação diferida de patches
- `drift-detector.js` — detecção de drift no filesystem
- `patch-manifest.js` — manifesto de patches
- `lifecycle.js` — ciclo de vida de replay
- `temporal-status.js` — status temporal de patches

---

## 6. Hybrid Executor (`scripts/hybrid-executor/`)

Executor híbrido que combina execução semântica com transformação estrutural de código.

| Submódulo | Função |
|---|---|
| `planning/` | Planejamento estrutural (structural-planning) |
| `structural/` | Transformação estrutural via AST (shadow-transform, structural-apply-engine, structural-execution-gate) |
| `governance/` | Gate de governança estrutural |
| `replay/` | Foundation de replay estrutural |
| `runtime/` | Validador de prontidão para release |
| `languages/javascript/` | Adaptador específico para JavaScript |
| `languages/typescript/` | Adaptador específico para TypeScript |
| `diagnostics/` | Diagnósticos do executor híbrido |
| `telemetry/` | Telemetria |

---

## 7. Validation Runtime (`scripts/validation-runtime/`)

Runtime dedicado à execução de validações com cache, replay e observabilidade.

| Submódulo | Função |
|---|---|
| `orchestrator/` | Orquestração do pipeline de validação |
| `validators/` | Validadores por domínio + adaptadores |
| `cache/` | Cache de resultados de validação |
| `graph/` | Grafo de dependências de validação |
| `artifacts/` | Artefatos de validação |
| `replay/` | Replay de validações |
| `diagnostics/` | Diagnósticos |
| `policies/` | Políticas de validação |
| `telemetry/` | Telemetria |

---

## 8. Review Runtime (`scripts/review-runtime/`)

Runtime de review com revisão determinística e análise semântica.

| Submódulo | Função |
|---|---|
| `orchestration/` | Orquestração do pipeline de review |
| `structural/` | Review estrutural (diff-based) |
| `semantic/` | Propagação semântica de review |
| `scoring/` | Scoring de qualidade |
| `invariants/` | Invariantes de review |
| `policies/` | Políticas de aprovação |
| `contract/` | Contrato de interface |
| `diagnostics/` | Diagnósticos |
| `telemetry/` | Telemetria |

**Módulos adicionais:** `deterministic-review-diff.js`, `deterministic-review-gate.js`, `deterministic-review-baseline.js`, `deterministic-review-runtime.js`.

---

## 9. Risk Runtime (`scripts/risk-runtime/`)

Análise e propagação de risco em execuções.

| Submódulo | Função |
|---|---|
| `engine/` | Motor de análise de risco |
| `factors/` | Fatores de risco |
| `scoring/` | Scoring de risco |
| `propagation/` | Propagação semântica de risco |
| `policies/` | Políticas de risco |
| `manifests/` | Manifestos de risco |
| `validation/` | Validação de risco |
| `contract/` | Contrato de interface |
| `diagnostics/` | Diagnósticos |
| `telemetry/` | Telemetria |

---

## 10. Correction Runtime (`scripts/correction-runtime/`)

Runtime de correção com classificação de falhas, remediação direcionada e propagação semântica.

| Submódulo | Função |
|---|---|
| `classification/` | Motor de classificação de falhas |
| `orchestration/` | Orquestrador adaptativo de correção |
| `remediation/` | Motor de remediação direcionada |
| `policies/` | Políticas de correção |
| `memory/` | Store de memória de correções |
| `lineage/` | Linhagem de correções aplicadas |
| `manifests/` | Manifestos de correção |
| `signatures/` | Assinaturas de falhas |
| `diagnostics/` | Diagnósticos |
| `telemetry/` | Telemetria |
| `lib/stable-stringify.js` | Serialização estável para fingerprinting |

---

## 11. Transaction Runtime (`scripts/transaction-runtime/`)

Controle transacional de mutações com snapshots e rollback.

| Submódulo | Função |
|---|---|
| `snapshots/` | Snapshots de estado do filesystem |
| `manifests/` | Manifestos transacionais |
| `diagnostics/` | Diagnósticos |
| `telemetry/` | Telemetria |

---

## 12. Semantic Dependency Runtime (`scripts/semantic-dependency-runtime/`)

Análise semântica de dependências entre arquivos e módulos.

| Submódulo | Função |
|---|---|
| `plugins/js-ts/` | Plugin de análise de imports JS/TS via `@babel/parser` |
| `overlay/` | Overlay de mutações semânticas |
| `fingerprint/` | Fingerprinting semântico |
| `validation/` | Validação de dependências |
| `diagnostics/` | Motor de diagnósticos semânticos |
| `lib/` | Utilitários internos |
| `fixture/` | Fixtures para testes |

---

## 13. Documentação adicionada (`docs/`)

| Arquivo | Conteúdo |
|---|---|
| `execution-plan-phase41.md` | Spec da fase 4.1 — Execution Plan |
| `validation-runtime-phase42.md` | Spec da fase 4.2 — Validation Runtime |
| `risk-runtime-phase43.md` | Spec da fase 4.3 — Risk Runtime |
| `review-runtime-phase44.md` | Spec da fase 4.4 — Review Runtime |
| `correction-runtime-phase45.md` | Spec da fase 4.5 — Correction Runtime |
| `transaction-runtime-phase46.md` | Spec da fase 4.6 — Transaction Runtime |
| `semantic-runtime-phase48.md` | Spec da fase 4.8 — Semantic Dependency Runtime |
| `discovery-phase410.md` | Discovery da fase 4.10 |
| `validation-runtime-phase410-release-readiness.md` | Release readiness da fase 4.10 |
| `execution-plan-phase411-stabilization.md` | Estabilização da fase 4.11 |
| `deterministic-review-phase411-release-readiness.md` | Release readiness da fase 4.11 |
| `validation-targeting-phase412.md` | Spec da fase 4.12 — Validation Targeting |
| `dry-run.md` | Guia de dry-run |
| `governance.md` | Guia de governança |
| `operator-guide.md` | Guia do operador |
| `troubleshooting.md` | Guia de troubleshooting |
| `recovery-system.md` | Documentação do sistema de recovery |
| `replay-and-resume.md` | Documentação de replay e resume |
| `runtime-lifecycle.md` | Ciclo de vida do runtime |
| `hybrid-runtime-lifecycle.md` | Ciclo de vida do executor híbrido |
| `hybrid-runtime-release-readiness.md` | Release readiness do executor híbrido |
| `stability-report-phase28.md` | Relatório de estabilidade da fase 2.8 |
| `phase2-freeze-checklist.md` | Checklist de freeze da fase 2 |
| `phase3-runtime-readiness.md` | Prontidão do runtime na fase 3 |
| `windows-terminal-utf8.md` | Configuração de UTF-8 no terminal Windows |
| `execution-graph-runtime/` | Suite completa de docs do grafo de execução (9 arquivos) |

### Modificados

- `docs/README.md` — atualizado com novos módulos
- `docs/observability.md` — expandido com novos hooks de telemetria
- `docs/setup-boss-evolution.md` — histórico atualizado até fase 4.12
- `docs/setup-boss-roadmap.md` — roadmap atualizado

---

## 14. Artefatos de runtime (`.setup-boss/`)

- **36 runs** registradas em `.setup-boss/runs/` (05/05 a 13/05/2026)
- **Daemon** com `queue.json` e `status.json` ativos
- **1 lock** de projeto ativo em `.setup-boss/locks/`
- **1 relatório** de E2E em `.setup-boss/reports/`

---

## 15. Testes

Suite de testes abrangente adicionada cobrindo todos os módulos:

- Governance (7 arquivos de teste)
- Preflight, Recovery, Replay
- CLI inspection
- Daemon (runtime-api, runtime-events, project-registry, worker-pool)
- Execution Plan (3 arquivos de teste)
- Validation Runtime, Semantic Dependency Runtime
- Risk Runtime (2), Review Runtime (5), Correction Runtime (2)
- Transaction Runtime, Hybrid Executor (7)
- Execution Graph (8 arquivos cobrindo scheduler, overlay, node-adapters, replay, risk, release-readiness)
- E2E: `daemon-runtime.e2e.test.js`
