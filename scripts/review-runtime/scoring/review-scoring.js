/**
 * Agregação determinística de scores (mesmos inputs → mesmo resultado).
 */

const SEVERITY_WEIGHT = Object.freeze({
  info: 2,
  low: 5,
  medium: 12,
  high: 22,
  critical: 40,
});

function normalizeScores({ structural_score, semantic_score, risk_dimension_score, validation_dimension_score }) {
  const s = Number(structural_score);
  const m = Number(semantic_score);
  const r = Number(risk_dimension_score);
  const v = Number(validation_dimension_score);

  const parts = [
    ["structural", !Number.isNaN(s) ? s : 100, 0.45],
    ["semantic", !Number.isNaN(m) ? m : 100, 0.2],
    ["risk", !Number.isNaN(r) ? r : 100, 0.2],
    ["validation", !Number.isNaN(v) ? v : 100, 0.15],
  ];

  let sumW = 0;
  let acc = 0;
  for (const [, val, w] of parts) {
    acc += val * w;
    sumW += w;
  }

  const final = sumW > 0 ? acc / sumW : 0;
  return Math.round(Math.max(0, Math.min(100, final)) * 100) / 100;
}

function penaltyFromInvariants(invariants) {
  if (!Array.isArray(invariants)) return 0;
  let p = 0;
  for (const inv of invariants) {
    if (!inv || inv.outcome !== "fail") continue;
    const sev = String(inv.severity || "medium").toLowerCase();
    p += SEVERITY_WEIGHT[sev] != null ? SEVERITY_WEIGHT[sev] : 12;
  }
  return Math.min(80, p);
}

function aggregateConfidence({ structural, semantic, invariantFailCount }) {
  let c = 0.75;
  if (structural && structural.dimensions && structural.dimensions.artifact_fingerprint) {
    if (structural.dimensions.artifact_fingerprint.ok) c += 0.1;
  }
  if (semantic && semantic.semantic_score >= 85) c += 0.08;
  c -= Math.min(0.35, (invariantFailCount || 0) * 0.07);
  return Math.round(Math.max(0.2, Math.min(0.98, c)) * 100) / 100;
}

function applyInvariantPenalty(baseScore, invariants) {
  const pen = penaltyFromInvariants(invariants);
  const next = baseScore - pen * 0.25;
  return Math.round(Math.max(0, Math.min(100, next)) * 100) / 100;
}

module.exports = {
  normalizeScores,
  penaltyFromInvariants,
  aggregateConfidence,
  applyInvariantPenalty,
  SEVERITY_WEIGHT,
};
