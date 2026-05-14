"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareDeterministicReviews,
  compactFinding,
  saveReviewDiffArtifact,
  DETERMINISTIC_REVIEW_DIFF_CONTRACT,
} = require("./deterministic-review-diff");

test("compareDeterministicReviews — novos, resolvidos, persistentes por finding_id", () => {
  const before = {
    findings: [
      { finding_id: "dr-a", code: "c1", type: "structural", severity: "error" },
      { finding_id: "dr-b", code: "c2", type: "semantic", severity: "warning" },
    ],
    fingerprints: { deterministic_review_content_sha256: "aaa" },
    risk_summary: { overall_risk_level: "medium", risk_score: 10 },
    gate: { mode: "off", threshold: "high", decision: "pass", risk_level: "medium" },
    metadata: { run_id: "r1" },
  };
  const after = {
    findings: [
      { finding_id: "dr-b", code: "c2", type: "semantic", severity: "warning" },
      { finding_id: "dr-c", code: "c3", type: "validation", severity: "error" },
    ],
    fingerprints: { deterministic_review_content_sha256: "bbb" },
    risk_summary: { overall_risk_level: "high", risk_score: 52 },
    gate: { mode: "enforce", threshold: "high", decision: "fail", risk_level: "high" },
    metadata: { run_id: "r2" },
  };
  const d = compareDeterministicReviews(before, after, { max_findings_per_bucket: 100 });
  assert.equal(d.schema_contract, DETERMINISTIC_REVIEW_DIFF_CONTRACT);
  assert.equal(d.summary.new_findings_count, 1);
  assert.equal(d.summary.resolved_findings_count, 1);
  assert.equal(d.summary.persistent_findings_count, 1);
  assert.equal(d.summary.fingerprint_changed, true);
  assert.equal(d.summary.risk_score_delta, 42);
  assert.equal(d.risk_changes.overall_risk_level.before, "medium");
  assert.equal(d.risk_changes.overall_risk_level.after, "high");
  assert.equal(d.gate_changes.decision.before, "pass");
  assert.equal(d.gate_changes.decision.after, "fail");
  assert.deepEqual(
    d.findings.new_findings.map((x) => x.finding_id),
    ["dr-c"],
  );
  assert.deepEqual(
    d.findings.resolved_findings.map((x) => x.finding_id),
    ["dr-a"],
  );
});

test("compareDeterministicReviews — ordenação determinística dos buckets", () => {
  const before = {
    findings: [
      { finding_id: "z", code: "a", type: "x", severity: "warning" },
      { finding_id: "a", code: "b", type: "x", severity: "warning" },
    ],
    fingerprints: {},
    risk_summary: {},
    metadata: {},
  };
  const after = {
    findings: [
      { finding_id: "m", code: "c", type: "y", severity: "info" },
      { finding_id: "b", code: "b", type: "x", severity: "warning" },
    ],
    fingerprints: {},
    risk_summary: {},
    metadata: {},
  };
  const d = compareDeterministicReviews(before, after, { max_findings_per_bucket: 50 });
  assert.deepEqual(
    d.findings.resolved_findings.map((x) => x.finding_id),
    ["a", "z"],
  );
  assert.deepEqual(
    d.findings.new_findings.map((x) => x.finding_id),
    ["b", "m"],
  );
});

test("compactFinding — eco code/type/severity", () => {
  assert.deepEqual(compactFinding({ finding_id: "x", code: "y", type: "z", severity: "error" }), {
    finding_id: "x",
    code: "y",
    type: "z",
    severity: "error",
  });
});

test("compareDeterministicReviews — docs ausentes: artifact_presence e buckets vazios", () => {
  const d = compareDeterministicReviews(null, null, {});
  assert.equal(d.artifact_presence.before, false);
  assert.equal(d.artifact_presence.after, false);
  assert.equal(d.summary.new_findings_count, 0);
  assert.equal(d.summary.resolved_findings_count, 0);
});

test("saveReviewDiffArtifact — grava review-diff.json", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const { REVIEW_DIFF_FILENAME } = require("./constants");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rev-diff-"));
  const diff = compareDeterministicReviews({ findings: [], risk_summary: {}, metadata: {} }, { findings: [], risk_summary: {}, metadata: {} });
  const p = saveReviewDiffArtifact(dir, diff, null);
  assert.ok(p && fs.existsSync(p));
  assert.ok(fs.readFileSync(p, "utf8").includes("deterministic-review-diff"));
  assert.ok(p.endsWith(REVIEW_DIFF_FILENAME));
});
