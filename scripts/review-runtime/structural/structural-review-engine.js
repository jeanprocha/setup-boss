/**
 * Motor de review estrutural determinístico (sem LLM).
 */

const { runAllInvariants } = require("../invariants");
const { validationFailed, riskTierCritical } = require("../invariants/validation-invariant");

function scoreReconciliation(recon) {
  if (!recon || typeof recon !== "object") {
    return { ok: true, score: 100, notes: ["reconciliation_absent"] };
  }
  const u = recon.coverage ? Number(recon.coverage.unexpected) : 0;
  const um = recon.coverage ? Number(recon.coverage.unmatched) : 0;
  let s = 100;
  if (recon.status === "divergent") s -= 35;
  else if (recon.status === "partial") s -= 15;
  s -= Math.min(40, u * 12 + um * 6);
  return { ok: u === 0 && recon.status !== "divergent", score: Math.max(0, Math.min(100, s)), notes: [] };
}

function scoreValidation(snapshot) {
  const vr = snapshot.validation_results;
  const summary = vr && vr.summary ? vr.summary : null;
  const failed = validationFailed(summary);
  if (!vr) return { ok: true, score: 100, notes: ["validation_absent"] };
  if (failed) return { ok: false, score: 40, notes: ["validation_failed"] };
  return { ok: true, score: 100, notes: ["validation_passed_or_neutral"] };
}

function scoreRisk(snapshot) {
  const ra = snapshot.risk_analysis;
  if (!ra || typeof ra !== "object") return { ok: true, score: 100, notes: ["risk_absent"] };
  const summary = ra.summary && typeof ra.summary === "object" ? ra.summary : ra;
  if (riskTierCritical(summary)) return { ok: false, score: 25, notes: ["risk_critical"] };
  const t = String(summary.tier || summary.risk_tier || "").toLowerCase();
  if (t === "high") return { ok: true, score: 55, notes: ["risk_high"] };
  if (t === "moderate" || t === "medium") return { ok: true, score: 75, notes: ["risk_moderate"] };
  return { ok: true, score: 90, notes: ["risk_low_or_unknown"] };
}

function scorePlanAdherence(snapshot) {
  const plan = snapshot.plan;
  const recon = snapshot.reconciliation;
  if (!plan) return { ok: true, score: 100, notes: ["plan_absent_shadow_ok"] };
  if (!recon) return { ok: true, score: 85, notes: ["reconciliation_absent"] };
  return scoreReconciliation(recon);
}

function scoreArtifactsFromInvariantList(invariants) {
  const violations = invariants.filter((v) => v.outcome === "fail");
  const warnOnly = invariants.filter((v) => v.outcome === "warn");
  let s = 100;
  s -= violations.length * 20;
  s -= warnOnly.length * 6;
  return {
    ok: violations.length === 0,
    score: Math.max(0, Math.min(100, s)),
    violations_count: violations.length,
    warnings_count: warnOnly.length,
  };
}

function runStructuralReview(snapshot) {
  const invariants = runAllInvariants(snapshot);
  const dimensions = {
    plan_adherence: scorePlanAdherence(snapshot),
    reconciliation_consistency: scoreReconciliation(snapshot.reconciliation),
    validation_consistency: scoreValidation(snapshot),
    risk_consistency: scoreRisk(snapshot),
    lifecycle_consistency: {
      ok: !invariants.some((i) => i.category === "lifecycle" && i.outcome === "fail"),
      score: invariants.some((i) => i.category === "lifecycle" && i.outcome === "fail")
        ? 50
        : 100,
      notes: [],
    },
    operation_consistency: {
      ok: !invariants.some(
        (i) => i.category === "operation" && i.outcome === "fail",
      ),
      score: invariants.some(
        (i) => i.id && String(i.id).startsWith("operation_") && i.outcome === "fail",
      )
        ? 60
        : 100,
      notes: [],
    },
    artifact_fingerprint: scoreArtifactsFromInvariantList(invariants),
  };

  const scores = Object.values(dimensions).map((d) =>
    typeof d.score === "number" ? d.score : 100,
  );
  const structuralScore =
    scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);

  return {
    dimensions,
    invariants,
    structural_score: Math.round(structuralScore * 100) / 100,
  };
}

module.exports = { runStructuralReview, scoreReconciliation, scoreValidation, scoreRisk };
