"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  compareAgainstBaseline,
  buildBaselineRegressionSummary,
  evaluateBaselineViolations,
  finalizeBaselineRegressionForRun,
  applyBaselineRegressionGateCliEffects,
  parseBaselineThresholdProfile,
} = require("./deterministic-review-baseline");

function minimalReview(overrides = {}) {
  const base = {
    version: 1,
    schema_contract: "deterministic-review/1",
    findings: [],
    summary: {
      findings_total: 0,
      warnings_total: 0,
      errors_total: 0,
      infos_total: 0,
      unresolved_validators_total: 0,
      failed_validations_total: 0,
    },
    risk_summary: {
      overall_risk_level: "low",
      risk_score: 0,
      structural_errors: 0,
      semantic_warnings: 0,
      validation_failures: 0,
      graph_truncations: 0,
      cache_inconsistencies: 0,
      highlights: [],
    },
    gate: { mode: "off", threshold: "high", decision: "pass", triggered_by: [], risk_level: "low" },
    fingerprints: {},
    metadata: { plan_id: "p1", run_id: "r1" },
  };
  return { ...base, ...overrides };
}

test("compareAgainstBaseline — novos findings + delta de risco determinísticos", () => {
  const baseline = minimalReview({
    findings: [
      {
        finding_id: "dr-aaa",
        type: "validation",
        severity: "warning",
        code: "x",
        message: "m",
        evidence: {},
        related_targets: [],
      },
    ],
    risk_summary: {
      ...minimalReview().risk_summary,
      risk_score: 10,
      validation_failures: 1,
      structural_errors: 0,
    },
  });

  const cur = minimalReview({
    findings: [
      ...baseline.findings,
      {
        finding_id: "dr-bbb",
        type: "structural",
        severity: "error",
        code: "y",
        message: "m2",
        evidence: {},
        related_targets: [],
      },
    ],
    gate: { mode: "off", threshold: "high", decision: "warn", triggered_by: [], risk_level: "medium" },
    risk_summary: {
      ...minimalReview().risk_summary,
      risk_score: 28,
      validation_failures: 2,
      structural_errors: 1,
    },
  });

  const cmp = compareAgainstBaseline(cur, baseline, {});
  assert.equal(cmp.regression.new_findings_count, 1);
  assert.equal(cmp.regression.risk_score_delta, 18);
  assert.equal(cmp.regression.validation_failures_delta, 1);
  assert.equal(cmp.regression.structural_errors_delta, 1);
  assert.equal(cmp.regression.gate_regressed, true);
});

test("evaluateBaselineViolations — perfil threshold só new_findings ignora gate", () => {
  const regression = {
    new_findings_count: 1,
    risk_score_delta: 5,
    gate_regressed: true,
    gate_decision_before: "pass",
    gate_decision_after: "fail",
    validation_failures_delta: 0,
    structural_errors_delta: 0,
    overall_risk_level_before: "low",
    overall_risk_level_after: "high",
  };
  const v = evaluateBaselineViolations(regression, ["new_findings"]);
  assert.deepEqual(v, ["new_findings"]);
});

test("buildBaselineRegressionSummary — baseline ausente não viola", () => {
  const env = {
    SETUP_BOSS_REVIEW_BASELINE_MODE: "enforce",
    SETUP_BOSS_REVIEW_BASELINE_PATH: "/nonexistent/review.json",
    SETUP_BOSS_REVIEW_BASELINE_THRESHOLD: "all",
  };
  const load = { ok: false, doc: null, resolved_path: "/x", error: "not_found" };
  const summary = buildBaselineRegressionSummary(minimalReview(), load, null, env);
  assert.equal(summary.decision.cli_effect, "none");
  assert.equal(summary.decision.skipped_reason, "baseline_unavailable");
});

test("finalizeBaselineRegressionForRun — grava review-baseline-summary.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-bl-"));
  const baseline = minimalReview({
    findings: [],
    risk_summary: { ...minimalReview().risk_summary, risk_score: 1 },
    gate: { mode: "off", threshold: "high", decision: "pass", triggered_by: [], risk_level: "low" },
  });
  const bp = path.join(dir, "baseline.json");
  fs.writeFileSync(bp, JSON.stringify(baseline), "utf8");

  const current = minimalReview({
    findings: [
      {
        finding_id: "dr-new",
        type: "cache",
        severity: "info",
        code: "c",
        message: "m",
        evidence: {},
        related_targets: [],
      },
    ],
    risk_summary: { ...minimalReview().risk_summary, risk_score: 1 },
  });

  const env = {
    SETUP_BOSS_REVIEW_BASELINE_MODE: "off",
    SETUP_BOSS_REVIEW_BASELINE_PATH: bp,
    SETUP_BOSS_REVIEW_BASELINE_THRESHOLD: "all",
  };
  finalizeBaselineRegressionForRun(dir, current, null, env, dir);
  const p = path.join(dir, "review-baseline-summary.json");
  assert.ok(fs.existsSync(p));
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(doc.decision.mode, "off");
});

test("applyBaselineRegressionGateCliEffects — enforce + violação define exitCode", () => {
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  const summary = {
    decision: { mode: "enforce", cli_effect: "fail", violated: ["new_findings"] },
    diagnostics: { regression_highlights: ["novos findings vs baseline: 1"] },
  };
  applyBaselineRegressionGateCliEffects(summary);
  assert.equal(process.exitCode, 1);
  process.exitCode = prevExit;
});

test("parseBaselineThresholdProfile — all determinístico", () => {
  const a = parseBaselineThresholdProfile({ SETUP_BOSS_REVIEW_BASELINE_THRESHOLD: "all" });
  const b = parseBaselineThresholdProfile({ SETUP_BOSS_REVIEW_BASELINE_THRESHOLD: "" });
  assert.deepEqual(a, b);
  assert.deepEqual(a, ["gate_regression", "new_findings", "risk_score_delta"]);
});
