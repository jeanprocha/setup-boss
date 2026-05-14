"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  buildStructuralReplayShadowPayload,
  writeStructuralReplayShadowArtifacts,
  getStructuralReplayShadowPayloadBuildCount,
  resetStructuralReplayShadowPayloadBuildCount,
} = require("../replay/structural-replay-shadow");
const { writeHybridExecutionArtifacts } = require("../hybrid-executor-core");
const { createReplayPayloadRunScope } = require("./replay-payload-session-cache");

function snapEffEnv() {
  return {
    STRUCTURAL_REPLAY_SHADOW_ENABLED: process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED,
    HYBRID_RUNTIME_OBSERVABILITY_ENABLED: process.env.HYBRID_RUNTIME_OBSERVABILITY_ENABLED,
    STRUCTURAL_GOVERNANCE_ENABLED: process.env.STRUCTURAL_GOVERNANCE_ENABLED,
  };
}

const INIT_E = snapEffEnv();
after(() => {
  resetStructuralReplayShadowPayloadBuildCount();
  for (const k of Object.keys(INIT_E)) {
    if (INIT_E[k] === undefined) delete process.env[k];
    else process.env[k] = INIT_E[k];
  }
});

test("4.9.7.2 — createReplayPayloadRunScope deduplica getOrBuild", () => {
  resetStructuralReplayShadowPayloadBuildCount();
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";

  const scope = createReplayPayloadRunScope();
  const row = {
    patch_index: 0,
    path: "a.js",
    plan_entry: {
      op: "replace_node",
      node_kind: "Literal",
      mapping_status: "mapped",
      node_span: { start: 8, end: 15 },
      search: `"alpha"`,
      replace: `"omega"`,
    },
    structural_replay: {},
    gate_snapshot: { confidence_score: 95, min_score_required: 50, allowed: true, block_reasons: [] },
    execution_mode_used: "structural",
  };

  const opts = {
    rows: [row],
    runDistinctFiles: 1,
    minScoreRequired: 50,
    projectRoot: "",
    initialOverlay: { "a.js": `const a="alpha";` },
  };

  const a = scope.getOrBuild(() => buildStructuralReplayShadowPayload(opts));
  const b = scope.getOrBuild(() => buildStructuralReplayShadowPayload(opts));
  assert.strictEqual(a, b);
  assert.equal(getStructuralReplayShadowPayloadBuildCount(), 1);
});

test("4.9.7.2 — shadow + observability: um único buildStructuralReplayShadowPayload", () => {
  resetStructuralReplayShadowPayloadBuildCount();
  process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED = "true";
  process.env.HYBRID_RUNTIME_OBSERVABILITY_ENABLED = "true";
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-eff-"));
  const row = {
    patch_index: 0,
    path: "a.js",
    plan_entry: {
      op: "replace_node",
      node_kind: "Literal",
      mapping_status: "mapped",
      node_span: { start: 8, end: 15 },
      search: `"alpha"`,
      replace: `"omega"`,
    },
    structural_replay: { span_out_of_bounds: false, search_missing_in_span: false, patch: {} },
    gate_snapshot: { confidence_score: 95, min_score_required: 50, allowed: true, block_reasons: [] },
    execution_mode_used: "structural",
  };

  writeHybridExecutionArtifacts({
    outputDir: tmp,
    rows: [row],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 5,
    runDistinctFiles: 1,
    initialOverlay: { "a.js": `const a="alpha";` },
  });

  assert.equal(getStructuralReplayShadowPayloadBuildCount(), 1);
  assert.ok(fs.existsSync(path.join(tmp, "structural-replay-shadow.json")));
  assert.ok(fs.existsSync(path.join(tmp, "hybrid-runtime-summary.json")));
  const summary = JSON.parse(fs.readFileSync(path.join(tmp, "hybrid-runtime-summary.json"), "utf8"));
  assert.equal(summary.artifact_validation.ok, true);
});

test("4.9.7.2 — writeStructuralReplayShadowArtifacts com prebuilt gera JSON idêntico ao build inline", () => {
  resetStructuralReplayShadowPayloadBuildCount();
  process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED = "true";
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";

  const row = {
    patch_index: 0,
    path: "a.js",
    plan_entry: {
      op: "replace_node",
      node_kind: "Literal",
      mapping_status: "mapped",
      node_span: { start: 8, end: 15 },
      search: `"alpha"`,
      replace: `"omega"`,
    },
    structural_replay: {},
    gate_snapshot: { confidence_score: 95, min_score_required: 50, allowed: true, block_reasons: [] },
    execution_mode_used: "structural",
  };

  const oBase = {
    rows: [row],
    runDistinctFiles: 1,
    minScoreRequired: 50,
    projectRoot: "",
    initialOverlay: { "a.js": `const a="alpha";` },
  };

  const pre = buildStructuralReplayShadowPayload(oBase);
  resetStructuralReplayShadowPayloadBuildCount();

  const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), "sb-eff-a-"));
  const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), "sb-eff-b-"));

  writeStructuralReplayShadowArtifacts({ outputDir: tmpA, ...oBase }, pre);
  writeStructuralReplayShadowArtifacts({ outputDir: tmpB, ...oBase });

  const one = JSON.parse(fs.readFileSync(path.join(tmpA, "structural-replay-shadow.json"), "utf8"));
  const two = JSON.parse(fs.readFileSync(path.join(tmpB, "structural-replay-shadow.json"), "utf8"));

  const { generated_at: _ga, ...oneRest } = one;
  const { generated_at: _gb, ...twoRest } = two;
  assert.deepEqual(oneRest, twoRest);
});

test("4.9.7.2 — duas corridas writeHybridExecutionArtifacts isolam contagem", () => {
  resetStructuralReplayShadowPayloadBuildCount();
  process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED = "true";
  process.env.HYBRID_RUNTIME_OBSERVABILITY_ENABLED = "false";
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";

  const row = {
    patch_index: 0,
    path: "a.js",
    execution_mode_used: "structural",
    gate_snapshot: { confidence_score: 90, min_score_required: 50, allowed: true, block_reasons: [] },
  };

  writeHybridExecutionArtifacts({
    outputDir: fs.mkdtempSync(path.join(os.tmpdir(), "sb-eff-r1-")),
    rows: [row],
    startedAt: "a",
    finishedAt: "b",
    durationMs: 1,
  });
  assert.equal(getStructuralReplayShadowPayloadBuildCount(), 1);

  resetStructuralReplayShadowPayloadBuildCount();
  writeHybridExecutionArtifacts({
    outputDir: fs.mkdtempSync(path.join(os.tmpdir(), "sb-eff-r2-")),
    rows: [row],
    startedAt: "a",
    finishedAt: "b",
    durationMs: 1,
  });
  assert.equal(getStructuralReplayShadowPayloadBuildCount(), 1);
});

test("4.9.7.2 — flags OFF: zero builds replay shadow", () => {
  resetStructuralReplayShadowPayloadBuildCount();
  process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED = "false";
  process.env.HYBRID_RUNTIME_OBSERVABILITY_ENABLED = "false";

  writeHybridExecutionArtifacts({
    outputDir: fs.mkdtempSync(path.join(os.tmpdir(), "sb-eff-off-")),
    rows: [{ patch_index: 0, path: "a.js", execution_mode_used: "textual" }],
    startedAt: "a",
    finishedAt: "b",
    durationMs: 1,
  });
  assert.equal(getStructuralReplayShadowPayloadBuildCount(), 0);
});

test("4.9.7.2 — mixed runtime: observability válida com shadow", () => {
  resetStructuralReplayShadowPayloadBuildCount();
  process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED = "true";
  process.env.HYBRID_RUNTIME_OBSERVABILITY_ENABLED = "true";
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-eff-mix-"));
  const rows = [
    {
      patch_index: 0,
      path: "a.js",
      plan_entry: {
        op: "replace_node",
        mapping_status: "mapped",
        node_span: { start: 8, end: 15 },
        search: `"alpha"`,
        replace: `"omega"`,
        node_kind: "Literal",
      },
      structural_replay: {},
      gate_snapshot: { confidence_score: 95, min_score_required: 50, allowed: true, block_reasons: [] },
      execution_mode_used: "structural",
    },
    {
      patch_index: 1,
      path: "a.js",
      execution_mode_used: "textual",
      fallback_trigger: "gate",
      fallback_reason_codes: ["low_confidence"],
      gate_snapshot: { confidence_score: 40, min_score_required: 90, allowed: false, block_reasons: [] },
    },
  ];

  writeHybridExecutionArtifacts({
    outputDir: tmp,
    rows,
    startedAt: "s",
    finishedAt: "e",
    durationMs: 3,
    runDistinctFiles: 1,
    initialOverlay: { "a.js": `const a="alpha";` },
  });

  assert.equal(getStructuralReplayShadowPayloadBuildCount(), 1);
  const summary = JSON.parse(fs.readFileSync(path.join(tmp, "hybrid-runtime-summary.json"), "utf8"));
  assert.equal(summary.telemetry_aggregate.counts.mixed_execution_modes, true);
  assert.equal(summary.artifact_validation.ok, true);
});
