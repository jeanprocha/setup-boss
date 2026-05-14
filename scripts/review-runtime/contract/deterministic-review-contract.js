/**
 * Contrato mínimo — deterministic-review.json (Fase 4.11, observacional).
 * Types de findings incluem pelo menos: cache, graph, validation, structural, semantic.
 */

const crypto = require("crypto");
const { stableStringify } = require("../../execution-plan/fingerprint/plan-fingerprint");
const { DETERMINISTIC_REVIEW_FILENAME } = require("../constants");

const DETERMINISTIC_REVIEW_SCHEMA_VERSION = 1;
const DETERMINISTIC_REVIEW_SCHEMA_CONTRACT = "deterministic-review/1";

function sha256ShortDeterministicReview(payload) {
  return crypto
    .createHash("sha256")
    .update(typeof payload === "string" ? payload : stableStringify(payload), "utf8")
    .digest("hex")
    .slice(0, 16);
}

function createEmptyDeterministicReview(base = {}) {
  const generatedAt = base.generated_at || new Date().toISOString();
  const planId = base.plan_id != null ? String(base.plan_id) : "";
  const runId = base.run_id != null ? String(base.run_id) : "";
  return {
    version: DETERMINISTIC_REVIEW_SCHEMA_VERSION,
    schema_contract: DETERMINISTIC_REVIEW_SCHEMA_CONTRACT,
    findings: [],
    summary: {
      findings_total: 0,
      warnings_total: 0,
      errors_total: 0,
      infos_total: 0,
      unresolved_validators_total: 0,
      failed_validations_total: 0,
    },
    risk_summary: {
      overall_risk_level: "low",
      risk_score: 0,
      structural_errors: 0,
      semantic_warnings: 0,
      validation_failures: 0,
      graph_truncations: 0,
      cache_inconsistencies: 0,
      highlights: [],
    },
    gate: {
      mode: "off",
      threshold: "high",
      decision: "pass",
      triggered_by: [],
      risk_level: "low",
    },
    fingerprints: {},
    metadata: {
      generated_at: generatedAt,
      plan_id: planId || null,
      run_id: runId || null,
      artifact: DETERMINISTIC_REVIEW_FILENAME,
      observational_only: true,
      ...(base.metadata && typeof base.metadata === "object" ? base.metadata : {}),
    },
  };
}

function validateDeterministicReviewShape(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") {
    errors.push("deterministic-review: raiz deve ser objecto.");
    return errors;
  }
  if (doc.version == null) errors.push("version em falta.");
  if (!doc.schema_contract) errors.push("schema_contract em falta.");
  if (!Array.isArray(doc.findings)) errors.push("findings deve ser array.");
  if (!doc.summary || typeof doc.summary !== "object") errors.push("summary inválido.");
  if (doc.risk_summary != null && typeof doc.risk_summary !== "object") {
    errors.push("risk_summary deve ser objecto quando presente.");
  }
  if (doc.gate != null && typeof doc.gate !== "object") {
    errors.push("gate deve ser objecto quando presente.");
  }
  return errors;
}

module.exports = {
  DETERMINISTIC_REVIEW_SCHEMA_VERSION,
  DETERMINISTIC_REVIEW_SCHEMA_CONTRACT,
  sha256ShortDeterministicReview,
  createEmptyDeterministicReview,
  validateDeterministicReviewShape,
};
