const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { normalizeEvaluation, collectEvaluationsForHook } = require("./governance-runtime-aggregator");
const {
  createGovernanceRuntimeManifest,
  saveGovernanceRuntimeManifest,
  loadGovernanceRuntimeManifest,
  appendEvaluations,
  recordHookCompleted,
  computeTelemetryDigest,
} = require("./governance-runtime-manifest");

test("normalizeEvaluation — força severidade válida", () => {
  const e = normalizeEvaluation({ severity: "nope", code: "X", phase: "p", source_runtime: "s" });
  assert.equal(e.severity, "INFO");
});

test("digest determinístico para mesmas avaliações em ordem diferente após append", () => {
  const m = createGovernanceRuntimeManifest("r1");
  appendEvaluations(m, [
    normalizeEvaluation({
      phase: "post_validation",
      source_runtime: "validation",
      severity: "WARN",
      code: "A",
      message: "m",
      evidence_refs: [],
    }),
    normalizeEvaluation({
      phase: "post_validation",
      source_runtime: "validation",
      severity: "INFO",
      code: "B",
      message: "n",
      evidence_refs: [],
    }),
  ]);
  const d1 = computeTelemetryDigest(m);
  const m2 = createGovernanceRuntimeManifest("r1");
  appendEvaluations(m2, [
    normalizeEvaluation({
      phase: "post_validation",
      source_runtime: "validation",
      severity: "INFO",
      code: "B",
      message: "n",
      evidence_refs: [],
    }),
    normalizeEvaluation({
      phase: "post_validation",
      source_runtime: "validation",
      severity: "WARN",
      code: "A",
      message: "m",
      evidence_refs: [],
    }),
  ]);
  const d2 = computeTelemetryDigest(m2);
  assert.equal(d1, d2);
});

test("hook phases — preflight lido uma vez no outputDir", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-rt-"));
  try {
    fs.writeFileSync(
      path.join(dir, "governance-decisions.json"),
      JSON.stringify({
        decisions: [{ code: "C1", severity: "WARN", message: "x", blocker: false }],
        blocker_codes: [],
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "execution-reconciliation.json"),
      JSON.stringify({
        schema_version: 1,
        status: "full",
        coverage: { planned_operations: 0, matched: 0, unmatched: 0, unexpected: 0 },
      }),
      "utf8",
    );

    const a = collectEvaluationsForHook("post_reconciliation", dir, { preflightAlreadyIngested: false });
    const b = collectEvaluationsForHook("post_reconciliation", dir, { preflightAlreadyIngested: true });
    assert.ok(a.some((x) => x.source_runtime === "preflight"));
    assert.ok(!b.some((x) => x.source_runtime === "preflight"));
    assert.ok(b.some((x) => x.source_runtime === "reconciliation"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("manifest round-trip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-rt2-"));
  try {
    const m = createGovernanceRuntimeManifest("run-x");
    appendEvaluations(m, [
      normalizeEvaluation({
        phase: "post_risk",
        source_runtime: "risk",
        severity: "INFO",
        code: "R",
        message: "",
        evidence_refs: [],
      }),
    ]);
    recordHookCompleted(m, "post_reconciliation");
    recordHookCompleted(m, "post_validation");
    recordHookCompleted(m, "post_risk");
    saveGovernanceRuntimeManifest(dir, m);
    const again = loadGovernanceRuntimeManifest(dir);
    assert.ok(again);
    assert.equal(again.run_id, "run-x");
    assert.equal(again.lifecycle_state, "PASSED");
    assert.ok(again.telemetry_digest.startsWith("sha256:"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
