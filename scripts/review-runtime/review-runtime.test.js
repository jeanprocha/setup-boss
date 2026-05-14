/**
 * Testes — Review Runtime (Fase 4.4).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { runStructuralReview } = require("./structural/structural-review-engine");
const { runReviewOrchestration } = require("./orchestration/review-orchestrator");
const { normalizeScores, applyInvariantPenalty } = require("./scoring/review-scoring");
const { evaluateReviewPolicies, resolveSummaryStatus } = require("./policies/review-policies");
const { collectRuntimeSnapshot } = require("./lib/runtime-snapshot");
const { REVIEW_RESULTS_FILENAME } = require("./constants");

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

test("scoring determinístico: mesmos inputs → mesmo resultado", () => {
  const a = normalizeScores({
    structural_score: 72,
    semantic_score: 88,
    risk_dimension_score: 80,
    validation_dimension_score: 90,
  });
  const b = normalizeScores({
    structural_score: 72,
    semantic_score: 88,
    risk_dimension_score: 80,
    validation_dimension_score: 90,
  });
  assert.equal(a, b);
  const pen = applyInvariantPenalty(a, [
    { outcome: "fail", severity: "high" },
    { outcome: "warn", severity: "low" },
  ]);
  const pen2 = applyInvariantPenalty(a, [
    { outcome: "fail", severity: "high" },
    { outcome: "warn", severity: "low" },
  ]);
  assert.equal(pen, pen2);
});

test("structural review detecta recon divergente e invariants estáveis", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rev-"));
  writeJson(path.join(dir, "execution-plan.json"), {
    plan_id: "p1",
    run_id: "r1",
    lifecycle_state: "EXECUTING",
    lifecycle_transitions: [],
    operations: [{ operation_id: "o1", type: "FILE_SCOPE", file: "src/a.js" }],
  });
  writeJson(path.join(dir, "executor-changes.json"), [
    { path: "src/other.js", search: "x", replace: "y" },
  ]);
  writeJson(path.join(dir, "execution-reconciliation.json"), {
    status: "divergent",
    coverage: { unexpected: 1, unmatched: 0, planned_operations: 1 },
    unexpected_changes: [{ path: "src/other.js" }],
    unmatched_operations: [],
  });
  writeJson(path.join(dir, "metadata.json"), {
    projectRoot: dir,
    runId: "r1",
  });

  const snap = collectRuntimeSnapshot(dir, null);
  const s1 = runStructuralReview(snap);
  const s2 = runStructuralReview(snap);
  assert.equal(s1.structural_score, s2.structural_score);
  assert.ok(s1.invariants.some((i) => i.id && String(i.id).includes("reconciliation")));
});

test("orchestrator grava review-results.json e legacy mapeado", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rev-orch-"));
  writeJson(path.join(dir, "metadata.json"), { projectRoot: dir, runId: "rx" });
  writeJson(path.join(dir, "execution-plan.json"), {
    plan_id: "p-orch",
    run_id: "rx",
    lifecycle_state: "EXECUTING",
    operations: [],
  });
  writeJson(path.join(dir, "executor-changes.json"), []);
  writeJson(path.join(dir, "executor-result.json"), { status: "success", summary: "ok" });
  writeJson(path.join(dir, "validation-results.json"), {
    summary: { status: "ok", failed_validators: 0 },
  });

  const out = runReviewOrchestration({
    outputDir: dir,
    telemetry: null,
    reviewEngineMode: "structural",
    outputFs: null,
  });
  assert.equal(out.ok, true);
  const rrPath = path.join(dir, REVIEW_RESULTS_FILENAME);
  assert.ok(fs.existsSync(rrPath));
  const legacy = out.legacy_review;
  assert.ok(["approved", "rejected", "blocked"].includes(legacy.status));
  assert.equal(typeof legacy.requires_correction, "boolean");
  const rr = JSON.parse(fs.readFileSync(rrPath, "utf8"));
  assert.equal(rr.extensions && rr.extensions.deterministic_review_ref, "deterministic-review.json");
  assert.ok(fs.existsSync(path.join(dir, "deterministic-review.json")));
});

test("policy: validation falhou + reconciliação divergente → blocked no resolveSummaryStatus", () => {
  const st = resolveSummaryStatus({
    finalScore: 60,
    invariantFailures: 0,
    blockedByPolicy: true,
    validationFailed: true,
    reconciliationDivergent: true,
    riskCritical: false,
  });
  assert.equal(st, "blocked");
});

test("policy evaluation inclui manual review para risco crítico", () => {
  const p = evaluateReviewPolicies({
    finalScore: 70,
    confidence: 0.8,
    invariantFailures: 0,
    invariantWarnings: 0,
    validationFailed: false,
    reconciliationDivergent: false,
    riskCritical: true,
    semanticLow: false,
  });
  assert.equal(p.requires_manual_review, true);
});
