/**
 * Políticas de consolidação do review (threshold hints; sem enforcement duro).
 */

function evaluateReviewPolicies({
  finalScore,
  confidence,
  invariantFailures,
  invariantWarnings,
  validationFailed,
  reconciliationDivergent,
  riskCritical,
  semanticLow,
}) {
  const policies_applied = [];

  let requires_manual_review = false;
  let requires_correction = false;
  let escalation_hints = [];

  if (riskCritical) {
    requires_manual_review = true;
    policies_applied.push("critical_risk_manual_review");
    escalation_hints.push("Risco crítico: rever antes de merge.");
  }

  if (validationFailed && reconciliationDivergent) {
    policies_applied.push("validation_plus_recon_block");
    escalation_hints.push("Validação falhou com reconciliação divergente.");
  }

  const failCount = invariantFailures || 0;
  if (failCount >= 3) {
    requires_correction = true;
    policies_applied.push("multiple_invariant_failures_reject");
  }

  if (finalScore < 40) {
    requires_correction = true;
    policies_applied.push("low_score_requires_correction");
  }

  if ((invariantWarnings || 0) >= 6) {
    requires_manual_review = true;
    policies_applied.push("elevated_warnings_manual_review");
  }

  if (semanticLow) {
    policies_applied.push("semantic_quality_followup");
    escalation_hints.push("Sinais semânticos fracos — revisão humano opcional.");
  }

  if (finalScore >= 82 && failCount === 0 && !riskCritical && !validationFailed) {
    policies_applied.push("auto_approve_band");
  }

  return {
    policies_applied,
    requires_manual_review,
    requires_correction,
    escalation_hints,
    double_review_suggested: riskCritical && validationFailed,
  };
}

function resolveSummaryStatus({
  finalScore,
  invariantFailures,
  blockedByPolicy,
  validationFailed,
  reconciliationDivergent,
  riskCritical,
}) {
  if (blockedByPolicy || (validationFailed && reconciliationDivergent)) {
    return "blocked";
  }
  if (invariantFailures >= 3 || finalScore < 30) {
    return "rejected";
  }
  if (riskCritical && validationFailed) {
    return "blocked";
  }
  if (finalScore >= 80 && invariantFailures === 0) {
    return "approved";
  }
  if (finalScore >= 55 && invariantFailures < 3) {
    return "partial";
  }
  return finalScore >= 45 ? "partial" : "rejected";
}

module.exports = { evaluateReviewPolicies, resolveSummaryStatus };
