# Fase 4.12.9 — Execution Graph Release Readiness

## Objetivo

Encerrar a **Fase 4.12** com hardening **advisory/shadow**: validação consolidada dos artefactos derivados do DAG runtime, auditoria de flags, compatibilidade e isolamento — **sem** alterar `orchestration.js`, **sem** execução DAG real e **sem** tornar componentes advisory em operacionais.

## Flag

| Variável | Valores | Comportamento |
|----------|---------|----------------|
| `SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS` | `off` (default) \| `shadow` | `off`: nada. `shadow`: grava `execution-graph-release-readiness.json` no **outputDir** da corrida (best-effort; erros engolidos; **exit code** inalterado). |

Debug opcional: `SETUP_BOSS_EXECUTION_GRAPH_DEBUG=1` regista aviso em falha de escrita.

## Artefacto

**`execution-graph-release-readiness.json`**

Campos mínimos:

- `schema_version`, `run_id`, `graph_id`, `graph_fingerprint`
- `release_status`: `ready` \| `warning` \| `blocked`
- `readiness_summary`
- `validated_components`
- `artifact_audit`, `feature_flag_audit`, `integration_audit`, `consistency_audit`, `compatibility_audit`
- `diagnostics` (agregação read-only das secções `diagnostics` dos relatórios existentes)
- `warnings`, `blockers`
- `created_at`
- `compat` (fase `4.12.9`, `advisory_only`)

## Implementação (`scripts/runtime/graph/release-readiness/`)

| Ficheiro | Função |
|----------|--------|
| `readiness-validator.js` | Orquestra validações; status final; degradação graciosa com artefactos em falta. |
| `artifact-auditor.js` | Presença / parse / chaves mínimas por artefacto conhecido. |
| `flag-auditor.js` | Modos `off` \| `shadow` para flags `SETUP_BOSS_EXECUTION_GRAPH*`. |
| `integration-validator.js` | Contratos advisory (replay/risk/overlay), scheduler `repeat_edges`, boundary de imports. |
| `diagnostics-consolidator.js` | Consolida `diagnostics` por fonte. |
| `release-report-builder.js` | Documento JSON final. |
| `artifact-writer.js` | Escrita atómica do JSON. |
| `shadow-hook.js` | `tryWriteShadowExecutionGraphReleaseReadiness` (chamado **por último** em `tryWriteShadowExecutionGraphArtifacts`). |

## Garantias explícitas

- **Pipeline oficial intacto** — hooks só em `run-runtime.js`; `orchestration.js` sem dependência do módulo graph.
- **DAG continua advisory** — scheduler, overlay, replay, risk, observabilidade: apenas leitura de artefactos e relatórios; nenhum handler real de etapa é invocado pelo release readiness.
- **Flags default `off`** — variáveis ausentes equivalem a `off`.
- **Integração isolada** — módulos listados em `integration-validator.js` não importam orchestration/executor/scan do pipeline.
- **`repeat_edges`** — validação semântica alinhada ao scheduler (não entram nas dependências de scheduling).

## Checklist final da Fase 4.12

- [x] **4.12.1** — Graph model (`execution-graph.json`)
- [x] **4.12.2** — Runtime state (`execution-graph-runtime.json`)
- [x] **4.12.3** — Scheduler advisory (`execution-graph-scheduler-report.json`)
- [x] **4.12.4** — Overlay (`execution-graph-overlay-report.json`)
- [x] **4.12.5** — Node adapters (`execution-graph-node-adapters.json`)
- [x] **4.12.6** — Replay advisory (`execution-graph-replay-report.json`)
- [x] **4.12.8** — Risk / deadlock (`execution-graph-risk-report.json`)
- [x] **4.12.9** — Release readiness (`execution-graph-release-readiness.json`)

## Testes

`scripts/runtime/graph/release-readiness/release-readiness.test.js` (incluído em `npm test`).
