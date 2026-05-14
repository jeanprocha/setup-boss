/**
 * Artefactos e versão — Validation Targeting (Fase 4.1.2, shadow).
 */

const VALIDATION_TARGETS_FILENAME = "validation-targets.json";
const VALIDATION_MANIFEST_FILENAME = "validation-manifest.json";
const VALIDATION_PROPAGATION_MANIFEST_FILENAME = "validation-propagation-manifest.json";
/** Artefato Fase 4.10.1 — plano declarativo (sem execução de validators). */
const VALIDATION_PLAN_FILENAME = "validation-plan.json";
/** Artefato Fase 4.10.3 — resultados da execução do validation-plan (local/sync). */
const VALIDATION_RESULTS_FILENAME = "validation-results.json";
/** Artefato Fase 4.10.4 — cache local de validações reusáveis (passed apenas). */
const VALIDATION_CACHE_FILENAME = "validation-cache.json";
/** Artefato Fase 4.10.5 — resumo pequeno para observabilidade (sem stdout/stderr). */
const VALIDATION_RUNTIME_SUMMARY_FILENAME = "validation-runtime-summary.json";
/** Artefato Fase 4.10.6 — grafo de dependências local (MVP, heurístico). */
const DEPENDENCY_GRAPH_FILENAME = "dependency-graph.json";

/** @readonly */
const VALIDATION_PROPAGATION_MANIFEST_SCHEMA_VERSION = "validation-propagation-manifest/1";

/** Limite máximo por execução (expansão report-only); evitar explosão de targeting. */
const VALIDATION_SEMANTIC_EXPANSION_CANDIDATE_CAP_DEFAULT = 512;

const VALIDATION_TARGETING_SCHEMA_VERSION = 1;

/** @typedef {'post_architect'|'post_reconciliation'} ValidationTargetingPhase */

module.exports = {
  VALIDATION_TARGETS_FILENAME,
  VALIDATION_MANIFEST_FILENAME,
  VALIDATION_PROPAGATION_MANIFEST_FILENAME,
  VALIDATION_PLAN_FILENAME,
  VALIDATION_RESULTS_FILENAME,
  VALIDATION_CACHE_FILENAME,
  VALIDATION_RUNTIME_SUMMARY_FILENAME,
  DEPENDENCY_GRAPH_FILENAME,
  VALIDATION_PROPAGATION_MANIFEST_SCHEMA_VERSION,
  VALIDATION_SEMANTIC_EXPANSION_CANDIDATE_CAP_DEFAULT,
  VALIDATION_TARGETING_SCHEMA_VERSION,
};
