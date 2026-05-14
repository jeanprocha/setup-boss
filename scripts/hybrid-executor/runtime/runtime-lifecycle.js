"use strict";

/**
 * Registo canónico de artefactos híbridos (filename → schema_version, phase, ordem).
 * Único ponto de verdade para validação 4.9.7.1 e tooling de consistência.
 */
const ARTIFACT_CONTRACTS = Object.freeze({
  "hybrid-shadow-runtime.json": { schema_version: 1, phase: "4.9.1", runtime_order: 10 },
  "hybrid-execution-results.json": { schema_version: 2, phase: "4.9.4.1", runtime_order: 40 },
  "structural-fallback-report.json": { schema_version: 2, phase: "4.9.4.1", runtime_order: 41 },
  "structural-planning.json": { schema_version: 1, phase: "4.9.2", runtime_order: 20 },
  "structural-hints.json": { schema_version: 1, phase: "4.9.2", runtime_order: 21 },
  "structural-confidence-report.json": { schema_version: 1, phase: "4.9.2", runtime_order: 22 },
  "structural-transform-plan.json": { schema_version: 2, phase: "4.9.3.1", runtime_order: 30 },
  "shadow-transform-results.json": { schema_version: 2, phase: "4.9.3.1", runtime_order: 31 },
  "shadow-transform-diff.json": { schema_version: 2, phase: "4.9.3.1", runtime_order: 32 },
  "structural-apply-session.json": { schema_version: 2, phase: "4.9.5.1", runtime_order: 46 },
  "structural-governance-report.json": { schema_version: 1, phase: "4.9.6", runtime_order: 50 },
  "structural-risk-analysis.json": { schema_version: 1, phase: "4.9.6", runtime_order: 51 },
  "structural-fingerprint-report.json": { schema_version: 1, phase: "4.9.6.1", runtime_order: 52 },
  "structural-lineage-report.json": { schema_version: 1, phase: "4.9.6.1", runtime_order: 53 },
  "structural-stale-analysis.json": { schema_version: 1, phase: "4.9.6.1", runtime_order: 54 },
  "structural-replay-shadow.json": { schema_version: 1, phase: "4.9.7", runtime_order: 55 },
  "structural-replay-classification.json": { schema_version: 1, phase: "4.9.7", runtime_order: 56 },
  "structural-replay-continuity.json": { schema_version: 1, phase: "4.9.7", runtime_order: 57 },
  "hybrid-runtime-summary.json": { schema_version: 1, phase: "4.9.7.1", runtime_order: 70 },
});

/** Ordem operacional das capacidades (narrativa + flags principais). */
const RUNTIME_PHASE_SEQUENCE = Object.freeze([
  {
    phase: "4.9.1",
    order: 10,
    name: "ast_readonly_shadow",
    summary: "Parse + AST read-only; hybrid-shadow-runtime.json",
    flags_hint: ["HYBRID_EXECUTOR_ENABLED", "STRUCTURAL_AST_READONLY_ENABLED"],
  },
  {
    phase: "4.9.2",
    order: 20,
    name: "structural_planning_shadow",
    summary: "Planner textual→MVP; structural-planning.json, hints, confidence",
    flags_hint: ["STRUCTURAL_PLANNING_ENABLED"],
  },
  {
    phase: "4.9.3",
    order: 30,
    name: "structural_transform_shadow",
    summary: "Simulação replace_node vs cadeia textual; shadow-transform-*.json",
    flags_hint: ["STRUCTURAL_SHADOW_TRANSFORMS_ENABLED"],
  },
  {
    phase: "4.9.4",
    order: 40,
    name: "hybrid_execution_apply",
    summary: "Structural-first com fallback textual; hybrid-execution-results, fallback-report",
    flags_hint: ["HYBRID_EXECUTION_ENABLED"],
  },
  {
    phase: "4.9.5",
    order: 45,
    name: "structural_apply_controlled",
    summary: "Apply estrutural com pós-validação (opt-in)",
    flags_hint: ["STRUCTURAL_APPLY_ENABLED"],
  },
  {
    phase: "4.9.6",
    order: 50,
    name: "structural_governance",
    summary: "Decisões risco/blockers; governance + risk JSON",
    flags_hint: ["STRUCTURAL_GOVERNANCE_ENABLED"],
  },
  {
    phase: "4.9.6.1",
    order: 52,
    name: "replay_foundation",
    summary: "Fingerprints, lineage, stale; sem apply de replay",
    flags_hint: ["STRUCTURAL_REPLAY_FOUNDATION_ENABLED", "STRUCTURAL_IDEMPOTENCY_ENABLED"],
  },
  {
    phase: "4.9.7",
    order: 55,
    name: "structural_replay_shadow",
    summary: "Simulação replay estrutural em overlay; classification + continuity",
    flags_hint: ["STRUCTURAL_REPLAY_SHADOW_ENABLED"],
  },
  {
    phase: "4.9.7.1",
    order: 70,
    name: "runtime_consolidation",
    summary: "Resumo lifecycle + telemetria agregada + validação de artefactos",
    flags_hint: ["HYBRID_RUNTIME_OBSERVABILITY_ENABLED"],
  },
]);

/**
 * @param {string} filename
 * @returns {{ schema_version: number, phase: string, runtime_order?: number }|null}
 */
function getArtifactContract(filename) {
  return ARTIFACT_CONTRACTS[filename] || null;
}

/**
 * Lista artefactos ordenados por runtime_order (para diff/CI).
 */
function listArtifactsByRuntimeOrder() {
  return Object.entries(ARTIFACT_CONTRACTS)
    .map(([filename, meta]) => ({ filename, ...meta }))
    .sort((a, b) => (a.runtime_order ?? 0) - (b.runtime_order ?? 0));
}

/**
 * @param {Record<string, boolean>|null} flagSnapshot
 */
function buildRuntimeLifecycleSummary(flagSnapshot) {
  return {
    consolidation_phase: "4.9.7.1",
    phase_pipeline: [...RUNTIME_PHASE_SEQUENCE],
    artifacts_manifest: listArtifactsByRuntimeOrder(),
    flag_snapshot: flagSnapshot && typeof flagSnapshot === "object" ? flagSnapshot : null,
  };
}

/**
 * Verifica se a sequência RUNTIME_PHASE_SEQUENCE está por `order` crescente.
 */
function assertPhaseSequenceOrdering() {
  for (let i = 1; i < RUNTIME_PHASE_SEQUENCE.length; i++) {
    if (RUNTIME_PHASE_SEQUENCE[i].order < RUNTIME_PHASE_SEQUENCE[i - 1].order) {
      return false;
    }
  }
  return true;
}

module.exports = {
  ARTIFACT_CONTRACTS,
  RUNTIME_PHASE_SEQUENCE,
  getArtifactContract,
  listArtifactsByRuntimeOrder,
  buildRuntimeLifecycleSummary,
  assertPhaseSequenceOrdering,
};
