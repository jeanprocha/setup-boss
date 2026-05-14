/**
 * Contrato replay-safe de review-results.json (Fase 4.4).
 */

const crypto = require("crypto");
const { REVIEW_RUNTIME_SCHEMA_VERSION } = require("../constants");

const SUMMARY_STATUS = Object.freeze([
  "approved",
  "rejected",
  "partial",
  "blocked",
]);

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function sha256Short(payload) {
  return crypto
    .createHash("sha256")
    .update(typeof payload === "string" ? payload : stableStringify(payload), "utf8")
    .digest("hex")
    .slice(0, 16);
}

function createEmptyReviewResults(base = {}) {
  const planId = base.plan_id != null ? String(base.plan_id) : "";
  const runId = base.run_id != null ? String(base.run_id) : "";
  const generatedAt = base.generated_at || new Date().toISOString();
  const reviewIdBase = { plan_id: planId, run_id: runId, at: generatedAt };

  return {
    schema_version: REVIEW_RUNTIME_SCHEMA_VERSION,
    review_id: `rv-${sha256Short(reviewIdBase)}`,
    plan_id: planId || null,
    run_id: runId || null,
    generated_at: generatedAt,
    summary: {
      status: "partial",
      score: 0,
      confidence: 0,
      requires_correction: false,
      requires_manual_review: false,
    },
    structural_review: {},
    semantic_review: {},
    policy_review: {},
    runtime_review: {},
    violations: [],
    warnings: [],
    recommendations: [],
    correction_hints: {},
    metadata: {
      review_engine_mode: base.review_engine_mode || "off",
      ...(base.metadata && typeof base.metadata === "object" ? base.metadata : {}),
    },
    extensions: {},
  };
}

function validateSummaryStatus(status) {
  return SUMMARY_STATUS.includes(status);
}

function validateReviewResultsShape(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") {
    errors.push("review-results: raiz deve ser objecto.");
    return errors;
  }
  if (doc.schema_version == null) errors.push("schema_version em falta.");
  if (!doc.review_id) errors.push("review_id em falta.");
  if (!doc.generated_at) errors.push("generated_at em falta.");
  if (!doc.summary || typeof doc.summary !== "object") {
    errors.push("summary inválido.");
  } else if (!validateSummaryStatus(doc.summary.status)) {
    errors.push(`summary.status inválido: ${doc.summary.status}`);
  }
  ["violations", "warnings", "recommendations"].forEach((k) => {
    if (!Array.isArray(doc[k])) errors.push(`${k} deve ser array.`);
  });
  return errors;
}

module.exports = {
  SUMMARY_STATUS,
  stableStringify,
  createEmptyReviewResults,
  validateReviewResultsShape,
  sha256Short,
};
