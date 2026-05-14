/**
 * Fator: reconciliation_divergence (Fase 4.3).
 */

const { baseScoreFromSeverity } = require("../policies/risk-policies");

/**
 * @param {object} ctx
 */
function evaluateReconciliationDivergence(ctx) {
  const r = ctx.reconciliation && typeof ctx.reconciliation === "object" ? ctx.reconciliation : null;
  if (!r) {
    return {
      factor_id: "reconciliation_divergence.v1",
      type: "reconciliation_divergence",
      severity: "low",
      score: 8,
      weight: 1,
      source: "execution-reconciliation.json",
      reason: "Reconciliação ausente — sem evidência de divergência plano/execução.",
      evidence: { present: false },
      metadata: {},
    };
  }

  const unexpected = Array.isArray(r.unexpected_changes) ? r.unexpected_changes.length : 0;
  const unmatched = Array.isArray(r.unmatched_operations) ? r.unmatched_operations.length : 0;

  let severity = "low";
  if (unexpected >= 5 || unmatched >= 8) severity = "critical";
  else if (unexpected >= 2 || unmatched >= 4) severity = "high";
  else if (unexpected >= 1 || unmatched >= 1) severity = "moderate";

  const score = baseScoreFromSeverity(severity);

  return {
    factor_id: "reconciliation_divergence.v1",
    type: "reconciliation_divergence",
    severity,
    score,
    weight: 1,
    source: "execution-reconciliation.json",
    reason: `unexpected_changes=${unexpected}, unmatched_operations=${unmatched}.`,
    evidence: {
      present: true,
      unexpected_changes: unexpected,
      unmatched_operations: unmatched,
      coverage: r.coverage || null,
    },
    metadata: {},
  };
}

module.exports = { evaluateReconciliationDivergence };
