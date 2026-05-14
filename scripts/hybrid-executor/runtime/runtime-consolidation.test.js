"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { assertPhaseSequenceOrdering, buildRuntimeLifecycleSummary } = require("./runtime-lifecycle");
const { buildAggregatedHybridTelemetry } = require("./runtime-telemetry-summary");
const {
  validateArtifactDoc,
  runArtifactValidationSuite,
  validateArtifactsBundleConsistency,
} = require("./runtime-artifact-validator");
const { writeHybridExecutionArtifacts } = require("../hybrid-executor-core");

function snapObsEnv() {
  return {
    HYBRID_RUNTIME_OBSERVABILITY_ENABLED: process.env.HYBRID_RUNTIME_OBSERVABILITY_ENABLED,
    STRUCTURAL_REPLAY_SHADOW_ENABLED: process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED,
  };
}

const INIT_OBS = snapObsEnv();
after(() => {
  for (const k of Object.keys(INIT_OBS)) {
    if (INIT_OBS[k] === undefined) delete process.env[k];
    else process.env[k] = INIT_OBS[k];
  }
});

test("4.9.7.1 — lifecycle ordering monotónico", () => {
  assert.equal(assertPhaseSequenceOrdering(), true);
});

test("4.9.7.1 — validateArtifactDoc detecta schema errado", () => {
  const bad = validateArtifactDoc("hybrid-execution-results.json", { schema_version: 999, phase: "4.9.4.1" });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes("schema_version")));
});

test("4.9.7.1 — validateArtifactDoc ignora ficheiro desconhecido", () => {
  const r = validateArtifactDoc("unknown.json", { foo: 1 });
  assert.equal(r.skipped, true);
  assert.equal(r.ok, true);
});

test("4.9.7.1 — telemetry aggregate mixed execution", () => {
  const rows = [
    { patch_index: 0, path: "a.js", execution_mode_used: "structural", fallback_trigger: "none" },
    { patch_index: 1, path: "a.js", execution_mode_used: "textual", fallback_trigger: "gate", fallback_reason_codes: ["x"] },
  ];
  const agg = buildAggregatedHybridTelemetry(rows, {
    startedAt: "t0",
    finishedAt: "t1",
    durationMs: 10,
    runDistinctFiles: 1,
  });
  assert.equal(agg.telemetry_schema_version, 1);
  assert.equal(agg.phase, "4.9.7.1");
  assert.equal(agg.counts.mixed_execution_modes, true);
  assert.equal(agg.counts.patch_steps, 2);
});

test("4.9.7.1 — bundle consistency mismatch per_patch vs classification", () => {
  const bundle = {
    "hybrid-execution-results.json": { schema_version: 2, phase: "4.9.4.1", per_patch: [{}, {}] },
    "structural-replay-classification.json": {
      schema_version: 1,
      phase: "4.9.7",
      summary: { per_patch: 1 },
    },
  };
  const c = validateArtifactsBundleConsistency(bundle);
  assert.equal(c.ok, false);
  assert.ok(c.errors.length > 0);
});

test("4.9.7.1 — runArtifactValidationSuite ok em bundle alinhado", () => {
  const hybrid = {
    schema_version: 2,
    phase: "4.9.4.1",
    per_patch: [1, 2].map((i) => ({ patch_index: i - 1, path: "x.js" })),
  };
  const fb = { schema_version: 2, phase: "4.9.4.1", entries: [1, 2] };
  const v = runArtifactValidationSuite({
    "hybrid-execution-results.json": hybrid,
    "structural-fallback-report.json": fb,
  });
  assert.equal(v.ok, true);
});

test("4.9.7.1 — writeHybridExecutionArtifacts: observability OFF → sem hybrid-runtime-summary", () => {
  process.env.HYBRID_RUNTIME_OBSERVABILITY_ENABLED = "false";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-obs-"));
  writeHybridExecutionArtifacts({
    outputDir: tmp,
    rows: [{ patch_index: 0, path: "a.js", execution_mode_used: "structural" }],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 1,
  });
  assert.ok(!fs.existsSync(path.join(tmp, "hybrid-runtime-summary.json")));
});

test("4.9.7.1 — writeHybridExecutionArtifacts: observability ON → hybrid-runtime-summary", () => {
  process.env.HYBRID_RUNTIME_OBSERVABILITY_ENABLED = "true";
  process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED = "false";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-obs2-"));
  writeHybridExecutionArtifacts({
    outputDir: tmp,
    rows: [{ patch_index: 0, path: "a.js", execution_mode_used: "structural" }],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 1,
    runDistinctFiles: 1,
  });
  const p = path.join(tmp, "hybrid-runtime-summary.json");
  assert.ok(fs.existsSync(p));
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(raw.schema_version, 1);
  assert.equal(raw.phase, "4.9.7.1");
  assert.ok(raw.lifecycle?.phase_pipeline?.length);
  assert.ok(raw.telemetry_aggregate?.counts);
  assert.equal(raw.artifact_validation?.ok, true);
});

test("4.9.7.1 — buildRuntimeLifecycleSummary inclui flag_snapshot", () => {
  const s = buildRuntimeLifecycleSummary({ HYBRID_EXECUTOR_ENABLED: false });
  assert.equal(s.consolidation_phase, "4.9.7.1");
  assert.ok(Array.isArray(s.artifacts_manifest));
});
