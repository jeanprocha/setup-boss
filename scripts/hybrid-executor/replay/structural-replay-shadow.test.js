"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  writeStructuralReplayShadowArtifacts,
  buildStructuralReplayShadowPayload,
} = require("./structural-replay-shadow");
const { classifyStructuralReplayRow, CLASSIFICATIONS } = require("./structural-replay-classifier");
const { buildStructuralStaleAnalysisReport } = require("./structural-stale-detector");
const { buildStructuralFingerprintReport } = require("./structural-fingerprint");
const { buildStructuralLineageReport } = require("./structural-lineage");

function snapReplayEnv() {
  return {
    STRUCTURAL_REPLAY_SHADOW_ENABLED: process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED,
    STRUCTURAL_GOVERNANCE_ENABLED: process.env.STRUCTURAL_GOVERNANCE_ENABLED,
    STRUCTURAL_IDEMPOTENCY_ENABLED: process.env.STRUCTURAL_IDEMPOTENCY_ENABLED,
    STRUCTURAL_GOVERNANCE_LOW_CONFIDENCE_MODE: process.env.STRUCTURAL_GOVERNANCE_LOW_CONFIDENCE_MODE,
  };
}

const INIT = snapReplayEnv();
after(() => {
  for (const k of Object.keys(INIT)) {
    if (INIT[k] === undefined) delete process.env[k];
    else process.env[k] = INIT[k];
  }
});

function basePlan(over = {}) {
  return {
    op: "replace_node",
    node_kind: "Literal",
    mapping_status: "mapped",
    node_span: { start: 13, end: 22 },
    search: `"alpha"`,
    replace: `"omega"`,
    ...over,
  };
}

test("4.9.7 — flags OFF não grava artefactos replay shadow", () => {
  process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED = "false";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rp-"));

  writeStructuralReplayShadowArtifacts({
    outputDir: tmp,
    rows: [{ patch_index: 0, path: "a.js" }],
  });

  assert.ok(!fs.existsSync(path.join(tmp, "structural-replay-shadow.json")));
});

test("4.9.7 — transform replayable + simulação overlay ok", () => {
  process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED = "false";
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";

  const content = `const a="alpha";`;
  const row = {
    patch_index: 0,
    path: "a.js",
    plan_entry: basePlan({ node_span: { start: 8, end: 15 } }),
    structural_replay: {
      patch: { search: `"alpha"`, replace: `"omega"` },
      span_out_of_bounds: false,
      search_missing_in_span: false,
    },
    gate_snapshot: { confidence_score: 95, min_score_required: 50, allowed: true, block_reasons: [] },
    execution_mode_used: "structural",
  };

  const { classificationPayload, continuity, shadowPayload } = buildStructuralReplayShadowPayload({
    rows: [row],
    initialOverlay: { "a.js": content },
    runDistinctFiles: 1,
    minScoreRequired: 50,
  });

  assert.equal(classificationPayload.per_patch[0].classification, CLASSIFICATIONS.REPLAYABLE);
  assert.equal(continuity.lineage_continuity.ok, true);
  assert.equal(shadowPayload.replay_simulation.overlay.chain_abort, null);
  assert.ok(classificationPayload.per_patch[0].overlay_replay_diagnostics.simulation_ok);
});

test("4.9.7 — already_applied (idempotência)", () => {
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";
  process.env.STRUCTURAL_IDEMPOTENCY_ENABLED = "true";

  const row = {
    patch_index: 0,
    path: "a.js",
    plan_entry: basePlan(),
    structural_replay: {
      patch: { search: `"alpha"`, replace: `"omega"` },
      capture_before_excerpt: `const x = "omega";\n`,
      span_out_of_bounds: false,
      search_missing_in_span: false,
    },
    gate_snapshot: { confidence_score: 90, min_score_required: 50, allowed: true, block_reasons: [] },
    execution_mode_used: "structural",
  };

  const fp = buildStructuralFingerprintReport([row], { runDistinctFiles: 1, minScoreRequired: 50 });
  const stale = buildStructuralStaleAnalysisReport([row], fp, {});

  const c = classifyStructuralReplayRow(row, { staleFindings: stale.findings, runDistinctFiles: 1, minScoreRequired: 50 });
  assert.equal(c.classification, CLASSIFICATIONS.ALREADY_APPLIED);
});

test("4.9.7 — stale_selector", () => {
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";

  const row = {
    patch_index: 0,
    path: "a.js",
    plan_entry: basePlan(),
    structural_replay: {
      span_out_of_bounds: true,
      search_missing_in_span: false,
      patch: { search: "x", replace: "y" },
    },
    gate_snapshot: { confidence_score: 90, min_score_required: 50, allowed: true, block_reasons: [] },
    execution_mode_used: "structural",
  };

  const fp = buildStructuralFingerprintReport([row], { runDistinctFiles: 1, minScoreRequired: 50 });
  const stale = buildStructuralStaleAnalysisReport([row], fp, {});

  const c = classifyStructuralReplayRow(row, { staleFindings: stale.findings, runDistinctFiles: 1, minScoreRequired: 50 });
  assert.equal(c.classification, CLASSIFICATIONS.STALE_SELECTOR);
});

test("4.9.7 — superseded_transform", () => {
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";

  const span1 = { start: 10, end: 20 };
  const span2 = { start: 12, end: 18 };

  const rows = [
    {
      patch_index: 0,
      path: "a.js",
      plan_entry: basePlan({ node_span: span1 }),
      structural_replay: { span_out_of_bounds: false, search_missing_in_span: false, patch: {} },
      gate_snapshot: { confidence_score: 90, min_score_required: 50, allowed: true, block_reasons: [] },
      execution_mode_used: "structural",
    },
    {
      patch_index: 1,
      path: "a.js",
      plan_entry: basePlan({ node_span: span2, search: "y", replace: "z" }),
      structural_replay: { span_out_of_bounds: false, search_missing_in_span: false, patch: {} },
      gate_snapshot: { confidence_score: 90, min_score_required: 50, allowed: true, block_reasons: [] },
      execution_mode_used: "structural",
    },
  ];

  const fp = buildStructuralFingerprintReport(rows, { runDistinctFiles: 1, minScoreRequired: 50 });
  const stale = buildStructuralStaleAnalysisReport(rows, fp, {});

  const c0 = classifyStructuralReplayRow(rows[0], {
    staleFindings: stale.findings,
    runDistinctFiles: 1,
    minScoreRequired: 50,
  });
  assert.equal(c0.classification, CLASSIFICATIONS.SUPERSEDED_TRANSFORM);

  const c1 = classifyStructuralReplayRow(rows[1], {
    staleFindings: stale.findings,
    runDistinctFiles: 1,
    minScoreRequired: 50,
  });
  assert.equal(c1.classification, CLASSIFICATIONS.REPLAYABLE);
});

test("4.9.7 — blocked_by_governance", () => {
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "true";

  const row = {
    patch_index: 0,
    path: "a.js",
    plan_entry: basePlan(),
    structural_replay: { span_out_of_bounds: false, search_missing_in_span: false, patch: {} },
    gate_snapshot: {
      confidence_score: 12,
      min_score_required: 90,
      allowed: false,
      block_reasons: ["confidence_below_threshold"],
    },
    execution_mode_used: "textual",
    fallback_reason_codes: [],
  };

  const fp = buildStructuralFingerprintReport([row], { runDistinctFiles: 1, minScoreRequired: 90 });
  const stale = buildStructuralStaleAnalysisReport([row], fp, {});

  const c = classifyStructuralReplayRow(row, {
    staleFindings: stale.findings,
    runDistinctFiles: 1,
    minScoreRequired: 90,
  });

  assert.equal(c.classification, CLASSIFICATIONS.BLOCKED_BY_GOVERNANCE);
  assert.ok(Array.isArray(c.governance_linkage?.blockers));
  assert.ok(c.governance_linkage.blockers.length > 0);
});

test("4.9.7 — lineage continuity (parent resolvido)", () => {
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";

  const rows = [
    {
      patch_index: 0,
      path: "a.js",
      plan_entry: basePlan({ node_span: { start: 13, end: 20 } }),
      structural_replay: { span_out_of_bounds: false, patch: {} },
      gate_snapshot: { confidence_score: 90, min_score_required: 50, allowed: true, block_reasons: [] },
      execution_mode_used: "structural",
    },
    {
      patch_index: 1,
      path: "a.js",
      plan_entry: basePlan({ node_span: { start: 14, end: 19 }, search: "o", replace: "x" }),
      structural_replay: { span_out_of_bounds: false, patch: {} },
      gate_snapshot: { confidence_score: 90, min_score_required: 50, allowed: true, block_reasons: [] },
      execution_mode_used: "structural",
    },
  ];

  const fp = buildStructuralFingerprintReport(rows, { runDistinctFiles: 1, minScoreRequired: 50 });
  const lineage = buildStructuralLineageReport(rows, fp);

  assert.equal(lineage.continuity.ok, true);
  assert.ok(lineage.entries[1].parent_lineage_id != null);
});

test("4.9.7 — writeStructuralReplayShadowArtifacts gera três JSON (flag ON)", () => {
  process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED = "true";
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rp2-"));

  const content = `const a="alpha";`;
  const rowWrite = {
    patch_index: 0,
    path: "a.js",
    plan_entry: basePlan({ node_span: { start: 8, end: 15 } }),
    structural_replay: { span_out_of_bounds: false, search_missing_in_span: false, patch: {} },
    gate_snapshot: { confidence_score: 95, min_score_required: 50, allowed: true, block_reasons: [] },
    execution_mode_used: "structural",
  };

  writeStructuralReplayShadowArtifacts({
    outputDir: tmp,
    rows: [rowWrite],
    runDistinctFiles: 1,
    initialOverlay: { "a.js": content },
  });

  assert.ok(fs.existsSync(path.join(tmp, "structural-replay-shadow.json")));
  assert.ok(fs.existsSync(path.join(tmp, "structural-replay-classification.json")));
  assert.ok(fs.existsSync(path.join(tmp, "structural-replay-continuity.json")));
});
