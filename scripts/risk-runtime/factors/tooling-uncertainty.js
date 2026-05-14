/**
 * Fator: tooling_uncertainty (Fase 4.3).
 */

const { baseScoreFromSeverity } = require("../policies/risk-policies");

function countSkippedValidators(results) {
  const validators = results && Array.isArray(results.validators) ? results.validators : [];
  let skipped = 0;
  let timeout = 0;
  let missingTool = 0;
  for (const v of validators) {
    const st = v && v.status ? String(v.status).toLowerCase() : "";
    if (st === "skipped") skipped += 1;
    const msg = v && Array.isArray(v.errors) ? v.errors.join(" ").toLowerCase() : "";
    if (/timeout/.test(msg)) timeout += 1;
    if (/not found|command failed|enoent|missing/i.test(msg)) missingTool += 1;
  }
  return { skipped, timeout, missingTool };
}

/**
 * @param {object} ctx
 */
function evaluateToolingUncertainty(ctx) {
  const res = ctx.validationResults && typeof ctx.validationResults === "object" ? ctx.validationResults : null;
  const counts = countSkippedValidators(res);
  const totalSignals = counts.skipped + counts.timeout + counts.missingTool;

  const validationRan =
    res && Array.isArray(res.validators) && res.validators.length > 0;

  if (!validationRan && !ctx.validationWasAttempted) {
    return {
      factor_id: "tooling_uncertainty.v1",
      type: "tooling_uncertainty",
      severity: "low",
      score: 5,
      weight: 1,
      source: "validation-results.json",
      reason: "Validação não executada nesta corrida — incerteza de tooling por omissão.",
      evidence: {
        skipped: 0,
        timeout: 0,
        missingTool: 0,
        validation_was_attempted: false,
        validators_total: 0,
      },
      metadata: {},
    };
  }

  let severity = "low";
  if (totalSignals >= 6 || (counts.timeout >= 2 && validationRan)) severity = "high";
  else if (totalSignals >= 3 || counts.timeout >= 1) severity = "moderate";

  const noValidationArtifact = !validationRan && ctx.validationWasAttempted;
  if (noValidationArtifact) severity = "moderate";

  const score = Math.min(
    100,
    (noValidationArtifact ? 35 : 0) + baseScoreFromSeverity(severity) + totalSignals * 4,
  );

  return {
    factor_id: "tooling_uncertainty.v1",
    type: "tooling_uncertainty",
    severity,
    score,
    weight: 1,
    source: "validation-results.json",
    reason: `skipped=${counts.skipped}, timeouts=${counts.timeout}, tooling_errors=${counts.missingTool}${noValidationArtifact ? "; validação esperada sem resultados" : ""}.`,
    evidence: {
      ...counts,
      validation_was_attempted: Boolean(ctx.validationWasAttempted),
      validators_total: res && Array.isArray(res.validators) ? res.validators.length : 0,
    },
    metadata: {},
  };
}

module.exports = { evaluateToolingUncertainty };
