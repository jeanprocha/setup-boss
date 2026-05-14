/**
 * Fator: validation_failures (Fase 4.3).
 */

const { baseScoreFromSeverity, maxSeverity } = require("../policies/risk-policies");

function classifyFailure(validator) {
  const st = validator && validator.status ? String(validator.status).toLowerCase() : "";
  const type = validator && validator.validator_type ? String(validator.validator_type).toLowerCase() : "";
  if (st === "error" || type === "structural") return { bucket: "structural", severity: "high" };
  if (type === "syntax" || type.includes("json")) return { bucket: "syntax", severity: "moderate" };
  if (type === "semantic" || type === "eslint") return { bucket: "semantic", severity: "moderate" };
  if (st === "failed") return { bucket: "semantic", severity: "moderate" };
  return { bucket: "unknown", severity: "low" };
}

/**
 * @param {object} ctx
 */
function evaluateValidationFailures(ctx) {
  const res = ctx.validationResults && typeof ctx.validationResults === "object" ? ctx.validationResults : null;
  const validators = res && Array.isArray(res.validators) ? res.validators : [];

  const failed = validators.filter(
    (v) => v && (String(v.status).toLowerCase() === "failed" || String(v.status).toLowerCase() === "error"),
  );

  if (failed.length === 0) {
    return {
      factor_id: "validation_failures.v1",
      type: "validation_failures",
      severity: "low",
      score: 5,
      weight: 1,
      source: "validation-results.json",
      reason: "Sem falhas de validator reportadas.",
      evidence: {
        failed_count: 0,
        buckets: {},
      },
      metadata: {},
    };
  }

  const buckets = { structural: 0, syntax: 0, semantic: 0, unknown: 0 };
  let sev = "low";
  for (const v of failed) {
    const c = classifyFailure(v);
    buckets[c.bucket] = (buckets[c.bucket] || 0) + 1;
    sev = maxSeverity(sev, c.severity);
  }
  if (failed.length >= 6) sev = maxSeverity(sev, "high");
  if (failed.length >= 12) sev = maxSeverity(sev, "critical");

  const score = Math.min(100, baseScoreFromSeverity(sev) + Math.min(25, failed.length * 2));

  return {
    factor_id: "validation_failures.v1",
    type: "validation_failures",
    severity: sev,
    score,
    weight: 1,
    source: "validation-results.json",
    reason: `${failed.length} validator(es) falhou(aram); buckets: ${JSON.stringify(buckets)}.`,
    evidence: {
      failed_count: failed.length,
      buckets,
      sample: failed.slice(0, 10).map((v) => ({
        validator_id: v.validator_id,
        validator_type: v.validator_type,
        status: v.status,
      })),
    },
    metadata: {},
  };
}

module.exports = { evaluateValidationFailures };
