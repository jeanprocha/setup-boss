/**
 * Correction Runtime tests (Fase 4.5) — núcleo determinístico.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyFailures } = require("./classification/failure-classification-engine");
const { computeFailureSignature } = require("./signatures/failure-signatures");
const {
  computeAdaptiveDecision,
  computeNextStreakForGate,
} = require("./orchestration/adaptive-correction-orchestrator");
const { getCorrectionPolicies } = require("./policies/correction-policies");

test("fingerprints deterministic para buckets equivalentes independentemente da ordem do array failures", () => {
  const snap = {
    plan: {},
    reconciliation: { status: "divergent", unexpected_changes: 2, orphan_operations: 1 },
    validation_results: { summary: { failed_validators: 1 } },
    risk_analysis: { summary: { tier: "low" } },
    executor_changes: [],
    executor_output_excerpt: "",
    executor_result: { status: "success" },
    metadata: { runId: "unit-fp" },
  };
  const reviewResults = {
    violations: [{ id: "inv_a", severity: "high", category: "x", evidence: [], remediation_hints: [] }],
    semantic_review: { skipped: true },
    correction_hints: { reconciliation_fix_required: true },
    summary: { requires_correction: true },
  };

  const a = classifyFailures({
    snapshot: snap,
    reviewResults,
    correctionHints: reviewResults.correction_hints || {},
  });
  const fbRev = [...a.failures].reverse();

  const s1 = computeFailureSignature({
    classifications: a.classifications,
    failures: a.failures,
    snapshot: snap,
    reviewResults,
    correctionHints: reviewResults.correction_hints,
  });
  const s2 = computeFailureSignature({
    classifications: a.classifications,
    failures: fbRev,
    snapshot: snap,
    reviewResults,
    correctionHints: reviewResults.correction_hints,
  });

  assert.equal(s1.failure_signature_sha256, s2.failure_signature_sha256);
});

test("computeNextStreakForGate — incrementa apenas quando coincide com última assinatura persistida", () => {
  assert.equal(
    computeNextStreakForGate({ last_failure_signature_sha256: "abc", identical_trigger_streak: 2 }, "abc"),
    3,
  );
  assert.equal(
    computeNextStreakForGate({ last_failure_signature_sha256: "abc", identical_trigger_streak: 2 }, "zzz"),
    1,
  );
});

test("computeAdaptiveDecision — alta streak suprime retry", () => {
  const adaptive = computeAdaptiveDecision({
    memoryStreakSignature: 25,
    policies: getCorrectionPolicies(),
    snapshot: { reconciliation: { status: "ok" }, validation_results: null, risk_analysis: null },
    reviewResults: { summary: { requires_correction: true } },
    classifications: [{ classification: "validation_failure", observed_items: 1 }],
    failureSignatureSha256: "ffffffff",
    remediationTargets: [{ target_id: "x", priority: 1, target_kind: "validation_failure", hint: "" }],
  });
  assert.equal(adaptive.retry_recommended, false);
  assert.equal(adaptive.retry_probability, 0);
  assert.equal(adaptive.suppress_retry, true);
});
