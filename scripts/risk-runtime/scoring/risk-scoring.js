/**
 * Agregação determinística de scores (Fase 4.3).
 */

const { getTierThresholds, defaultFactorWeights, maxSeverity } = require("../policies/risk-policies");

/**
 * @param {object[]} factors
 * @param {object} [weights]
 * @returns {{ aggregate: number, tier: 'low'|'moderate'|'high'|'critical', by_type: Record<string, number> }}
 */
function aggregateWeightedScores(factors, weights = defaultFactorWeights()) {
  const w = weights && typeof weights === "object" ? weights : defaultFactorWeights();
  const list = Array.isArray(factors) ? factors : [];

  let num = 0;
  let den = 0;
  const byType = {};

  for (const f of list) {
    if (!f || typeof f !== "object") continue;
    const t = f.type != null ? String(f.type) : "unknown";
    const weight = Math.max(0, Number(w[t]) || 0);
    const score = Math.max(0, Math.min(100, Number(f.score) || 0));
    if (weight <= 0) continue;
    num += score * weight;
    den += weight;
    if (!byType[t] || (Number(f.score) || 0) > byType[t]) {
      byType[t] = score;
    }
  }

  const aggregate = den > 0 ? Math.round((num / den) * 1000) / 1000 : 0;
  const clamped = Math.max(0, Math.min(100, aggregate));
  const tier = mapScoreToTier(clamped, getTierThresholds());
  return { aggregate: clamped, tier, by_type: byType };
}

function mapScoreToTier(score, thresholds) {
  const t = thresholds || getTierThresholds();
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  if (s >= t.critical_min) return "critical";
  if (s >= t.high_min) return "high";
  if (s >= t.moderate_min) return "moderate";
  return "low";
}

/**
 * Confiança 0–1 com penalizações documentadas (determinísticas).
 */
function computeConfidence(snapshot) {
  let c = 1;
  const sn = snapshot && typeof snapshot === "object" ? snapshot : {};

  if (!sn.has_execution_plan) c -= 0.18;
  if (sn.plan_present_but_empty_operations) c -= 0.08;
  if (sn.validation_expected_but_missing_results) c -= 0.12;
  if (sn.plan_present_but_reconciliation_missing) c -= 0.08;
  if (sn.partial_validation || sn.validators_skipped > 0) {
    c -= Math.min(0.15, 0.05 * (Number(sn.validators_skipped) || 1));
  }
  if (sn.tooling_missing_signals > 0) {
    c -= Math.min(0.12, 0.04 * Number(sn.tooling_missing_signals));
  }

  const out = Math.max(0.22, Math.min(1, Math.round(c * 1000) / 1000));
  return out;
}

/**
 * Severidade máxima de factors para sinalização.
 * @param {object[]} factors
 */
function maxFactorSeverity(factors) {
  let m = "low";
  for (const f of factors || []) {
    if (!f || !f.severity) continue;
    m = maxSeverity(m, String(f.severity).toLowerCase());
  }
  return m;
}

module.exports = {
  aggregateWeightedScores,
  mapScoreToTier,
  computeConfidence,
  maxFactorSeverity,
};
