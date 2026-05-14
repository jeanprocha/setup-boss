/**
 * Contrato oficial risk-analysis.json — serialização estável (Fase 4.3).
 */

const crypto = require("crypto");
const { RISK_RUNTIME_SCHEMA_VERSION } = require("../constants");

/**
 * @param {object} part
 */
function stableStringify(part) {
  const seen = new WeakSet();
  function walk(x) {
    if (x === null || typeof x !== "object") return x;
    if (seen.has(x)) return null;
    seen.add(x);
    if (Array.isArray(x)) return x.map(walk);
    const keys = Object.keys(x).sort();
    const o = {};
    for (const k of keys) {
      o[k] = walk(x[k]);
    }
    return o;
  }
  return JSON.stringify(walk(part));
}

/**
 * @param {object} inputFingerprintPayload — object já canónico (sem timestamps)
 */
function computeRiskAnalysisId(planId, runId, inputFingerprintPayload) {
  const h = crypto
    .createHash("sha256")
    .update(
      stableStringify({
        plan_id: String(planId || ""),
        run_id: String(runId || ""),
        inputs: inputFingerprintPayload,
        schema: RISK_RUNTIME_SCHEMA_VERSION,
      }),
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);
  return `ra-${h}`;
}

/**
 * @param {object[]} factors
 */
function sortFactors(factors) {
  const list = Array.isArray(factors) ? factors.slice() : [];
  list.sort((a, b) => {
    const ida = a && a.factor_id != null ? String(a.factor_id) : "";
    const idb = b && b.factor_id != null ? String(b.factor_id) : "";
    return ida.localeCompare(idb);
  });
  return list;
}

/**
 * @param {object[]} signals
 */
function sortSignals(signals) {
  const list = Array.isArray(signals) ? signals.slice() : [];
  list.sort((a, b) => {
    const sa = stableStringify(a || {});
    const sb = stableStringify(b || {});
    return sa.localeCompare(sb);
  });
  return list;
}

/**
 * @param {object} params
 */
function buildRiskAnalysisContract(params) {
  const plan_id = params.plan_id != null ? String(params.plan_id) : "";
  const run_id = params.run_id != null ? String(params.run_id) : "";
  const factors = sortFactors(params.factors);
  const signals = sortSignals(params.signals);
  const recommendations = Array.isArray(params.recommendations)
    ? params.recommendations.map((r) => String(r)).sort((a, b) => a.localeCompare(b))
    : [];

  const fingerprintPayload = {
    factors: factors.map((f) => ({
      type: f.type,
      factor_id: f.factor_id,
      severity: f.severity,
      score: f.score,
      weight: f.weight,
    })),
    signals: signals.map((s) => ({ id: s.id, kind: s.kind })),
  };

  const risk_analysis_id = computeRiskAnalysisId(plan_id, run_id, fingerprintPayload);

  const summary = params.summary && typeof params.summary === "object" ? { ...params.summary } : {};

  const review_hints =
    params.review_hints && typeof params.review_hints === "object"
      ? { ...params.review_hints }
      : {};

  const metadata = params.metadata && typeof params.metadata === "object" ? { ...params.metadata } : {};

  return {
    schema_version: RISK_RUNTIME_SCHEMA_VERSION,
    risk_analysis_id,
    plan_id,
    run_id,
    generated_at: params.generated_at || new Date().toISOString(),
    summary,
    factors,
    signals,
    recommendations,
    review_hints,
    orchestration_hints:
      params.orchestration_hints && typeof params.orchestration_hints === "object"
        ? params.orchestration_hints
        : {},
    review_escalation:
      params.review_escalation && typeof params.review_escalation === "object"
        ? params.review_escalation
        : {},
    validation_escalation:
      params.validation_escalation && typeof params.validation_escalation === "object"
        ? params.validation_escalation
        : {},
    governance_hints:
      params.governance_hints && typeof params.governance_hints === "object"
        ? params.governance_hints
        : {},
    propagation_summary:
      params.propagation_summary && typeof params.propagation_summary === "object"
        ? params.propagation_summary
        : {},
    metadata,
  };
}

module.exports = {
  stableStringify,
  computeRiskAnalysisId,
  buildRiskAnalysisContract,
  sortFactors,
  sortSignals,
};
