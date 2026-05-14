/**
 * Artefactos e versões — Risk Runtime (Fase 4.3).
 */

const RISK_RUNTIME_SCHEMA_VERSION = 1;

const RISK_ANALYSIS_FILENAME = "risk-analysis.json";

const RISK_RUNTIME_MANIFEST_FILENAME = "risk-runtime-manifest.json";

/** Artefactos do semantic dependency overlay (consulta apenas por path). */
const RISK_SEMANTIC_PROPAGATION_MANIFEST_REF = "propagation-manifest.json";
const RISK_SEMANTIC_MUTATION_GRAPH_REF = "semantic-mutation-graph.json";
const RISK_SIGNAL_SOURCE = Object.freeze({
  ENGINE: "risk-engine",
  POLICY: "risk-policy",
});

module.exports = {
  RISK_RUNTIME_SCHEMA_VERSION,
  RISK_ANALYSIS_FILENAME,
  RISK_RUNTIME_MANIFEST_FILENAME,
  RISK_SEMANTIC_PROPAGATION_MANIFEST_REF,
  RISK_SEMANTIC_MUTATION_GRAPH_REF,
  RISK_SIGNAL_SOURCE,
};
