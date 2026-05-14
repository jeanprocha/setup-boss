/**
 * Orquestra supressões, probabilidades de retry recomendadas e escalações lógicas.
 */

const crypto = require("crypto");
const { getCorrectionPolicies, shouldEscalateRuntime } = require("../policies/correction-policies");
const {
  validationFailed,
  riskTierCritical,
} = require("../../review-runtime/invariants/validation-invariant");

function summarizePrimaryClassification(classifications) {
  if (!classifications || !classifications.length) return "unknown_mix";
  const sorted = [...classifications].sort((a, b) => {
    const ac = typeof a.observed_items === "number" ? -a.observed_items : 0;
    const bc = typeof b.observed_items === "number" ? -b.observed_items : 0;
    if (ac !== bc) return ac - bc;
    return String(a.classification).localeCompare(String(b.classification));
  });
  return String(sorted[0].classification || "unknown_mix");
}

function classifyRetryBand({ classifications, remediationTargets, reconciliationDivergent }) {
  const prim = summarizePrimaryClassification(classifications);
  if (prim === "reconciliation_failure" && reconciliationDivergent) return "narrow_reconcile_then_patch";
  if (prim === "validation_failure") return "narrow_validation_local";
  if (prim === "executor_failure") return "narrow_executor_micro";
  const opScoped =
    remediationTargets &&
    remediationTargets.filter((t) => t.target_kind === "executor_failure").length;
  if (prim === "structural_failure" && opScoped) return "structural_but_operation_targeted_executor";
  if (prim === "semantic_failure") return "narrow_semantic_hints";
  if (prim === "runtime_failure") return "narrow_runtime_harden";
  return "general_progressive";
}

function computeAdaptiveDecision({
  memoryStreakSignature,
  policies,
  snapshot,
  reviewResults,
  classifications,
  failureSignatureSha256,
  remediationTargets,
}) {
  const reconDiv = snapshot.reconciliation && snapshot.reconciliation.status === "divergent";

  const raSum =
    snapshot.risk_analysis && snapshot.risk_analysis.summary
      ? snapshot.risk_analysis.summary
      : snapshot.risk_analysis && typeof snapshot.risk_analysis === "object"
        ? snapshot.risk_analysis
        : null;
  const vrSummary =
    snapshot.validation_results && snapshot.validation_results.summary
      ? snapshot.validation_results.summary
      : null;

  const valFailed = validationFailed(vrSummary);
  const critRisk = riskTierCritical(raSum);

  let retryProbability = Math.min(
    0.94,
    0.52 +
      classifications.reduce((acc, row) => acc + Number(row.observed_items || 0) * 0.02, 0),
  );

  let retryRecommended =
    classifications.length === 0 && reviewResults && reviewResults.summary?.requires_correction
      ? true
      : classifications.length > 0;

  const suppressionPolicies = [];

  /** @type {null | object} */
  let suppression_reason = null;

  let suppress_retry = Boolean(
    memoryStreakSignature >= policies.retry_suppression_identical_signature_streak,
  );

  if (suppress_retry) {
    suppression_reason = {
      code: "repeated_failure_signature",
      streak: memoryStreakSignature,
      threshold: policies.retry_suppression_identical_signature_streak,
      failure_signature_sha256: failureSignatureSha256,
    };
    retryRecommended = false;
    retryProbability = policies.max_retry_probability_when_suppressed || 0;
    suppressionPolicies.push(`suppress_identical_failure_signature:${memoryStreakSignature}`);
  }

  if (classificationHas(classifications, "structural_failure") && memoryStreakSignature >= 3) {
    suppressionPolicies.push("structural_invariant_loop_guard");
    if (!suppress_retry && memoryStreakSignature >= policies.retry_suppression_identical_signature_streak + 2) {
      suppress_retry = true;
      suppression_reason = {
        ...(suppression_reason || {}),
        code: "structural_invariant_pressure",
      };
      retryRecommended = false;
      retryProbability = policies.max_retry_probability_when_suppressed || 0;
    }
  }

  if (valFailed && reconcileOnlySyntax(vrSummary)) {
    suppressionPolicies.push("validation_syntax_local_retry_ok");
    if (!suppress_retry && retryRecommended) {
      retryProbability = Math.max(
        retryProbability,
        typeof policies.min_retry_probability_for_local_validation_syntax === "number"
          ? policies.min_retry_probability_for_local_validation_syntax
          : 0.64,
      );
    }
  }

  let requires_runtime_escalation = false;

  const esc = shouldEscalateRuntime({
    classifications,
    reconciliationDivergent: reconDiv,
    riskCritical: critRisk,
  });

  requires_runtime_escalation = !!esc && esc.escalate;

  if (suppress_retry && reviewResults && reviewResults.summary?.requires_manual_review) {
    retryProbability = policies.max_retry_probability_when_suppressed || 0;
    retryRecommended = false;
    suppressionPolicies.push("manual_review_flags_present");
  }

  const escalation_event =
    requires_runtime_escalation && esc && esc.reason
      ? {
          type: requires_runtime_escalation ? "correction_escalated" : "ignored",
          reason: esc.reason,
          captured_at: new Date().toISOString(),
          failure_signature_sha256: failureSignatureSha256,
          id:
            crypto
              .createHash("sha256")
              .update(`${failureSignatureSha256 || ""}:${esc.reason}`)
              .digest("hex")
              .slice(0, 32),
        }
      : null;

  return {
    failure_classification: summarizePrimaryClassification(classifications),
    retry_recommended: retryRecommended && !suppress_retry,
    retry_probability:
      suppress_retry ? policies.max_retry_probability_when_suppressed || 0 : Math.round(retryProbability * 1000) / 1000,
    requires_manual_intervention:
      Boolean(reviewResults && reviewResults.summary && reviewResults.summary.requires_manual_review) ||
      (suppress_retry &&
        typeof policies.manual_intervention_after_streak_multiplier === "number" &&
        memoryStreakSignature >= policies.retry_suppression_identical_signature_streak * policies.manual_intervention_after_streak_multiplier),
    requires_runtime_escalation,
    suppress_retry,
    suppression_reason,
    suppression_policies: suppressionPolicies.sort(),
    retry_band: classifyRetryBand({
      classifications,
      remediationTargets,
      reconciliationDivergent: reconDiv,
    }),
    escalation_event,
  };
}

function classificationHas(rows, needle) {
  return (rows || []).some((r) => r.classification === needle);
}

function reconcileOnlySyntax(vrSummary) {
  if (!vrSummary || !validationFailed(vrSummary)) return false;
  const detailRows = vrSummary.failures_detail;
  const anySemantic =
    Array.isArray(detailRows) &&
    detailRows.some(
      (d) =>
        d &&
        (String(d.validator_type || "").toLowerCase().includes("semantic") ||
          String(d.validator_id || "").toLowerCase().includes("semantic")),
    );
  return !anySemantic;
}

function computeNextStreakForGate(memory, incomingSignatureSha256) {
  const last =
    memory && memory.last_failure_signature_sha256 ? String(memory.last_failure_signature_sha256) : null;
  const sig = incomingSignatureSha256 ? String(incomingSignatureSha256) : "";
  if (!sig) return 1;
  if (!last || last !== sig) return 1;
  const prev = Number.isFinite(Number(memory.identical_trigger_streak))
    ? Number(memory.identical_trigger_streak)
    : 0;
  return prev + 1;
}

function finalizeMemoryAfterGate(memoryBase, incomingSignatureSha256, gateStreak) {
  const sig = incomingSignatureSha256 ? String(incomingSignatureSha256) : "";
  const out = { ...(memoryBase || {}) };
  if (sig) out.last_failure_signature_sha256 = sig;
  if (gateStreak != null) out.identical_trigger_streak = Math.max(0, Math.floor(Number(gateStreak)));
  return out;
}

module.exports = {
  computeAdaptiveDecision,
  summarizePrimaryClassification,
  computeNextStreakForGate,
  finalizeMemoryAfterGate,
};
