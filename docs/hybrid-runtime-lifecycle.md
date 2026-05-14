# Hybrid Runtime — lifecycle, fases e artefactos (Fase 4.9.x)

Documento operacional para **`scripts/hybrid-executor`**: ordem das capacidades, flags, ficheiros JSON gerados, fluxos de fallback/governança/replay **shadow**, troubleshooting e limitações MVP.

**Documentos relacionados:** [`hybrid-runtime-release-readiness.md`](./hybrid-runtime-release-readiness.md) (Fase 4.9 encerrada — rollout, checklist, rollback), [`observability.md`](./observability.md) (artefactos gerais da corrida e métricas LLM).

---

## Ordem das fases (visão geral)

A pipeline híbrida empilha capacidades **opt-in** por variáveis de ambiente. Ordem lógica de evolução (não é ordem estrita de execução de um único `node`): AST read-only → planning → transform shadow → execução híbrida → apply controlado → governança → fundação replay → replay shadow → consolidação observabilidade.

| Ordem | Fase   | Nome (código)              | Resumo |
|-------|--------|----------------------------|--------|
| 10    | 4.9.1  | `ast_readonly_shadow`      | Parse/validate AST sem aplicar patches |
| 20    | 4.9.2  | `structural_planning_shadow` | Plano textual→MVP (hints, confidence) |
| 30    | 4.9.3  | `structural_transform_shadow` | Simulação replace_node vs cadeia textual |
| 40    | 4.9.4  | `hybrid_execution_apply`   | Structural-first + fallback **textual** |
| 45    | 4.9.5  | `structural_apply_controlled` | Apply estrutural com pós-validação |
| 50    | 4.9.6  | `structural_governance`    | Risco, blockers, relatórios de governança |
| 52    | 4.9.6.1 | `replay_foundation`       | Fingerprints, lineage, stale (relatórios) |
| 55    | 4.9.7  | `structural_replay_shadow` | Simulação replay em overlay (sem apply real) |
| 70    | 4.9.7.1 | `runtime_consolidation`   | `hybrid-runtime-summary.json`, validação |

A sequência canónica e o manifesto de ficheiros estão em **`scripts/hybrid-executor/runtime/runtime-lifecycle.js`** (`RUNTIME_PHASE_SEQUENCE`, `ARTIFACT_CONTRACTS`).

---

## Flags híbridas (resumo)

| Variável | Efeito principal |
|----------|------------------|
| `HYBRID_EXECUTOR_ENABLED` | Liga o ramo híbrido no executor |
| `STRUCTURAL_AST_READONLY_ENABLED` | AST read-only / shadow de parse |
| `STRUCTURAL_PLANNING_ENABLED` | Planning estrutural (4.9.2) |
| `STRUCTURAL_SHADOW_TRANSFORMS_ENABLED` | Shadow de transforms (4.9.3) |
| `HYBRID_EXECUTION_ENABLED` | Structural-first + fallback textual (4.9.4) |
| `STRUCTURAL_APPLY_ENABLED` | Apply estrutural controlado (4.9.5) |
| `STRUCTURAL_GOVERNANCE_ENABLED` | Relatórios de governança (4.9.6) |
| `STRUCTURAL_REPLAY_FOUNDATION_ENABLED` | Fingerprints / lineage / stale (4.9.6.1) |
| `STRUCTURAL_IDEMPOTENCY_ENABLED` | Heurísticas `already_applied` nos relatórios |
| `STRUCTURAL_REPLAY_SHADOW_ENABLED` | Artefactos replay shadow (4.9.7) |
| `HYBRID_RUNTIME_OBSERVABILITY_ENABLED` | `hybrid-runtime-summary.json` + validação (4.9.7.1) |

Valores aceites como ligados: `1`, `true`, `yes`, `on` (ver `feature-flags.js`).

**Snapshot** de flags numa corrida: campo `flag_snapshot` dentro de `lifecycle` em `hybrid-runtime-summary.json` (quando 4.9.7.1 está ligada).

---

## Artefactos gerados (matriz)

Contrato canónico (`schema_version`, `phase`, `runtime_order`) por nome de ficheiro:

| Ficheiro | Phase típica | Quando costuma existir |
|----------|--------------|-------------------------|
| `hybrid-shadow-runtime.json` | 4.9.1 | Shadow AST |
| `structural-planning.json`, `structural-hints.json`, `structural-confidence-report.json` | 4.9.2 | Planning ON |
| `structural-transform-plan.json`, `shadow-transform-results.json`, `shadow-transform-diff.json` | 4.9.3.1 | Shadow transforms ON |
| `hybrid-execution-results.json`, `structural-fallback-report.json` | 4.9.4.1 | Hybrid execution aplicável e telemetria gravada |
| `structural-apply-session.json` | 4.9.5.1 | Apply controlado + sessão |
| `structural-governance-report.json`, `structural-risk-analysis.json` | 4.9.6 | Governance ON |
| `structural-fingerprint-report.json`, `structural-lineage-report.json`, `structural-stale-analysis.json` | 4.9.6.1 | Replay foundation ON |
| `structural-replay-shadow.json`, `structural-replay-classification.json`, `structural-replay-continuity.json` | 4.9.7 | Replay shadow ON |
| `hybrid-runtime-summary.json` | 4.9.7.1 | Observability ON |

Validação programática: **`runtime-artifact-validator.js`** (`validateArtifactDoc`, `runArtifactValidationSuite`).

---

## Fallback flow (4.9.4)

1. O gate estrutural decide se o patch corre em modo **structural** ou **textual**.
2. Em falha estrutural (confidence, divergência, apply exception, governança preemptiva, etc.), o executor **cai para o patch textual** sem abortar a corrida.
3. `hybrid-execution-results.json` regista `execution_mode_used` por patch; `structural-fallback-report.json` agrega histogramas e `entries` espelhando os passos.

Diagnóstico: comparar `fallback_trigger_histogram` e `fallback_reason_codes` nos dois JSON.

---

## Governance flow (4.9.6)

- Com `STRUCTURAL_GOVERNANCE_ENABLED`, o pipeline calcula blockers por patch (ex.: baixa confiança, multi-ficheiro, AST corrupt, preempt).
- Artefactos: `structural-governance-report.json`, `structural-risk-analysis.json`.
- Replay shadow (4.9.7) pode classificar patches como `blocked_by_governance` quando a governança está ativa e há blockers.

---

## Replay shadow flow (4.9.7)

- **Sem** apply real no filesystem: simulação em **overlay** (memória + snapshot inicial opcional).
- Classificações: `replayable`, `already_applied`, `stale_selector`, `selector_missing`, `superseded_transform`, `blocked_by_governance`.
- Continuidade: lineage + cadeia overlay em `structural-replay-continuity.json`.

---

## Telemetria consolidada (4.9.7.1)

- **`buildAggregatedHybridTelemetry`** (`runtime-telemetry-summary.js`): agregado normalizado com `telemetry_schema_version`, histogramas, contagens structural/textual, linhas com `governance_preempt`, etc.
- Eventos finos do shadow 4.9.1 continuam em **`hybrid-telemetry.js`** (`hybrid.shadow.*`); o agregado não substitui esses eventos.

---

## Troubleshooting (rápido)

| Sintoma | Onde olhar |
|---------|------------|
| Só modo textual | `hybrid-execution-results.json` → `fallback_reason`, `gate_snapshot` |
| Dúvida sobre ordem de fases | `runtime-lifecycle.js` → `RUNTIME_PHASE_SEQUENCE` |
| Schema / phase incorretos | `runArtifactValidationSuite` no bundle ou CI que valide JSON |
| `per_patch` vs `classification.summary.per_patch` divergem | inconsistência de corrida; reexecutar com mesmas flags |
| Replay shadow vazio ou fraco | `STRUCTURAL_REPLAY_FOUNDATION_ENABLED` alimenta `plan_entry` / `structural_replay` no executor |
| Sem `hybrid-runtime-summary.json` | `HYBRID_RUNTIME_OBSERVABILITY_ENABLED` |

---

## Limitações MVP atuais

- **4.9.7.2:** Com `STRUCTURAL_REPLAY_SHADOW_ENABLED` e `HYBRID_RUNTIME_OBSERVABILITY_ENABLED`, o payload de replay shadow é construído **uma vez** por `writeHybridExecutionArtifacts` e reutilizado para os três JSON de replay e para o bundle validado no resumo (`replay-payload-session-cache.js`).

- **Sem** replay apply real, **sem** propagação semântica global, **sem** transacções multi-ficheiro unificadas, **sem** workflows de aprovação externos neste runtime.
- Contratos de `schema_version` **diferem por família** (ex.: 2 para hybrid execution vs 1 para governance); a fonte de verdade é **`ARTIFACT_CONTRACTS`**.
- A validação 4.9.7.1 cobre **apenas** os ficheiros incluídos no `bundle` da corrida (híbrido + fallback; replay shadow opcional no bundle se a flag estiver ligada).

---

## Referências no repositório

- `scripts/hybrid-executor/runtime/runtime-lifecycle.js`
- `scripts/hybrid-executor/runtime/runtime-telemetry-summary.js`
- `scripts/hybrid-executor/runtime/runtime-artifact-validator.js`
- `scripts/hybrid-executor/runtime/replay-payload-session-cache.js`
- `scripts/hybrid-executor/runtime/runtime-release-validator.js` (matriz de flags / release readiness 4.9.8)
- `scripts/hybrid-executor/hybrid-executor-core.js` (`writeHybridExecutionArtifacts`)
- `docs/hybrid-runtime-release-readiness.md` (encerramento Fase 4.9)
- `docs/observability.md` (pipeline geral Setup Boss e artefactos por corrida)
