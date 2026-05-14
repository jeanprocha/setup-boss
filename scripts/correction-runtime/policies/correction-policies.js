/**
 * Thresholds declarativos e hints de política de correção.
 */

function getCorrectionPolicies() {
  const num = (envKey, fallback) => {
    const n = Number(process.env[envKey]);
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    retry_suppression_identical_signature_streak: Math.max(
      2,
      Math.floor(num("SETUP_BOSS_CORRECTION_SUPPRESS_STREAK", 3)),
    ),
    escalation_reconciliation_divergent: true,
    escalation_risk_critical: true,
    max_retry_probability_when_suppressed: 0,
    min_retry_probability_for_local_validation_syntax: num(
      "SETUP_BOSS_CORRECTION_LOCAL_RETRY_SEMANTICS",
      0.65,
    ),
    telemetry_sample_rate: Math.min(
      1,
      Math.max(0.01, num("SETUP_BOSS_CORRECTION_TELEMETRY_SAMPLE", 1)),
    ),
    progressive_remediation_max_targets_prime: Math.max(
      1,
      Math.floor(num("SETUP_BOSS_CORRECTION_PRIMING_TARGETS_CAP", 20)),
    ),
    manual_intervention_after_streak_multiplier: Math.max(
      1,
      Number(num("SETUP_BOSS_CORRECTION_MANUAL_STREAK_FACTOR", 1.75)),
    ),
  };
}

function shouldEscalateRuntime({ classifications, reconciliationDivergent, riskCritical }) {
  const buckets = {};
  for (const c of classifications || []) {
    buckets[c.classification] = c.observed_items;
  }
  if (
    reconciliationDivergent ||
    buckets.reconciliation_failure > 0
  )
    return { escalate: true, reason: "reconciliation_critical" };
  if (riskCritical) return { escalate: true, reason: "risk_critical" };
  const critExec = buckets.executor_failure >= 3;
  const critStructural = buckets.structural_failure >= 5;
  if (critExec && critStructural) return { escalate: true, reason: "multi_executor_structural_pressure" };
  return { escalate: false, reason: null };
}

module.exports = {
  getCorrectionPolicies,
  shouldEscalateRuntime,
};
