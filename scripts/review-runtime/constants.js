/**
 * Artefactos — Deterministic Review Runtime (Fase 4.4).
 */

const REVIEW_RUNTIME_SCHEMA_VERSION = 1;

const REVIEW_RESULTS_FILENAME = "review-results.json";

const REVIEW_RUNTIME_MANIFEST_FILENAME = "review-runtime-manifest.json";

const REVIEW_CORRECTION_HINTS_FILENAME = "review-correction-hints.json";

/** Artefactos Semantic Dependency Runtime (mesmos nomes que risk-runtime). */
const REVIEW_SEMANTIC_PROPAGATION_MANIFEST_REF = "propagation-manifest.json";

const REVIEW_SEMANTIC_MUTATION_GRAPH_REF = "semantic-mutation-graph.json";

/** Snapshot replay-safe do bloco semantic_propagation (modo shadow). */
const REVIEW_SEMANTIC_PROPAGATION_ARTIFACT = "review-semantic-propagation.json";

/** Fase 4.11 — evidências estruturais observacionais (não bloqueia pipeline). */
const DETERMINISTIC_REVIEW_FILENAME = "deterministic-review.json";

/** Fase 4.11.6 — diff entre deterministic-review.json (opcional; CLI/CI). */
const REVIEW_DIFF_FILENAME = "review-diff.json";

/** Fase 4.11.7 — sumário opcional baseline/regression (separado do deterministic-review.json). */
const REVIEW_BASELINE_SUMMARY_FILENAME = "review-baseline-summary.json";

module.exports = {
  REVIEW_RUNTIME_SCHEMA_VERSION,
  REVIEW_RESULTS_FILENAME,
  REVIEW_RUNTIME_MANIFEST_FILENAME,
  REVIEW_CORRECTION_HINTS_FILENAME,
  REVIEW_SEMANTIC_PROPAGATION_MANIFEST_REF,
  REVIEW_SEMANTIC_MUTATION_GRAPH_REF,
  REVIEW_SEMANTIC_PROPAGATION_ARTIFACT,
  DETERMINISTIC_REVIEW_FILENAME,
  REVIEW_DIFF_FILENAME,
  REVIEW_BASELINE_SUMMARY_FILENAME,
};
