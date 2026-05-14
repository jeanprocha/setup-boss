"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const { buildInitialRuntimeSnapshot } = require("../runtime-state/snapshot-builder");
const { computeDeterministicSchedulingOrder } = require("../scheduler/dependency-resolver");
const { resetGlobalTransitionSeqForTests } = require("../runtime-state/transition-engine");
const { OVERLAY_ARTIFACT_FILENAME, OVERLAY_STATUS, OVERLAY_MODE } = require("./constants");
const { tryWriteShadowOverlayReport } = require("./shadow-hook");
const { buildPipelineOverlayModel } = require("./overlay-engine");
const { buildOverlayReport } = require("./overlay-report-builder");
const { computeOverlayStatusAndMessages } = require("./consistency-analyzer");
const { findDuplicateSchedulerNodes } = require("./comparison-validators");
const { NODE_ID } = require("../constants");

test.afterEach(() => {
  resetGlobalTransitionSeqForTests(0);
});

function writeJson(dir, name, obj) {
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function touch(dir, name) {
  fs.writeFileSync(path.join(dir, name), "{}\n", "utf8");
}

test("overlay warning: runtime sem transitions + scheduler advisory comparável", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-over-"));
  try {
    const m = buildPipelineOverlayModel({ outputDir: dir, runId: "r1" });
    assert.equal(m.overlay_status, OVERLAY_STATUS.WARNING);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("overlay divergent: fingerprint runtime inválido", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-over-"));
  try {
    const g = buildCanonicalExecutionGraph();
    const doc = buildInitialRuntimeSnapshot(g, { run_id: "r2", now_iso: "2026-01-01T00:00:00.000Z" });
    doc.graph_fingerprint = "0".repeat(64);
    writeJson(dir, "execution-graph-runtime.json", doc);
    const m = buildPipelineOverlayModel({ outputDir: dir, runId: "r2" });
    assert.equal(m.overlay_status, OVERLAY_STATUS.DIVERGENT);
    assert.ok(m.divergence_summary.some((d) => d.code === "fingerprint_inconsistency"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("overlay warning: scheduler report on-disk ≠ deterministic order", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-over-"));
  try {
    const order = computeDeterministicSchedulingOrder(buildCanonicalExecutionGraph());
    const wrong = [...order].reverse();
    writeJson(dir, "execution-graph-scheduler-report.json", {
      schema_version: 1,
      executed_nodes: wrong,
      run_id: "r3",
      graph_fingerprint: computeExecutionGraphFingerprint(buildCanonicalExecutionGraph()),
    });
    const m = buildPipelineOverlayModel({ outputDir: dir, runId: "r3" });
    assert.equal(m.overlay_status, OVERLAY_STATUS.WARNING);
    assert.ok(m.divergence_summary.some((d) => d.code === "scheduler_order_mismatch"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("overlay divergent: duplicate nós no scheduler on-disk", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-over-"));
  try {
    const order = computeDeterministicSchedulingOrder(buildCanonicalExecutionGraph());
    const dup = [...order];
    dup.splice(2, 0, NODE_ID.SCAN);
    writeJson(dir, "execution-graph-scheduler-report.json", {
      schema_version: 1,
      executed_nodes: dup,
      run_id: "r4",
    });
    const m = buildPipelineOverlayModel({ outputDir: dir, runId: "r4" });
    assert.equal(m.overlay_status, OVERLAY_STATUS.DIVERGENT);
    assert.ok(findDuplicateSchedulerNodes(dup).includes(NODE_ID.SCAN));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("overlay warning: monotonia linear quebrada por loop (executor repetido)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-over-"));
  try {
    touch(dir, "scan-output.md");
    touch(dir, "architect-output.md");
    touch(dir, "execution-plan.json");
    touch(dir, "executor-result.json");
    touch(dir, "validation-targets.json");
    touch(dir, "validation-results.json");
    touch(dir, "review-output.json");
    touch(dir, "correction-instructions.md");
    writeJson(dir, "runtime-checkpoints.json", {
      schema_version: 1,
      run_id: "r5",
      checkpoints: [
        { phase_completed: "AFTER_ARCHITECT" },
        { phase_completed: "AFTER_EXECUTOR" },
        { phase_completed: "AFTER_REVIEW" },
        { phase_completed: "AFTER_CORRECTION" },
        { phase_completed: "AFTER_EXECUTOR" },
        { phase_completed: "AFTER_REVIEW" },
      ],
    });
    const m = buildPipelineOverlayModel({ outputDir: dir, runId: "r5" });
    assert.equal(m.overlay_status, OVERLAY_STATUS.WARNING);
    assert.ok(m.warnings.some((w) => w.code === "linear_order_non_monotone_due_to_pipeline_loop"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("computeOverlayStatus: linear mismatch sem loop → divergent", () => {
  const det = ["a", "b", "c"];
  const p = computeOverlayStatusAndMessages({
    linearOrder: ["c", "a"],
    deterministicOrder: det,
    schedulerOrder: det,
    runtimeDoc: { transitions: [] },
    fingerprintResult: { ok: true, errors: [] },
    schedulerDuplicateNodes: [],
    linearOrphans: [],
  });
  assert.equal(p.overlay_status, OVERLAY_STATUS.DIVERGENT);
});

test("feature flag off: não grava overlay report", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY;
  process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY = "off";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-over-"));
  try {
    tryWriteShadowOverlayReport({ outputDir: dir, runId: "x" });
    assert.equal(fs.existsSync(path.join(dir, OVERLAY_ARTIFACT_FILENAME)), false);
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY;
    else process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("feature flag shadow: gera execution-graph-overlay-report.json", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY;
  process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY = OVERLAY_MODE.SHADOW;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-over-"));
  try {
    tryWriteShadowOverlayReport({ outputDir: dir, runId: "x" });
    assert.equal(fs.existsSync(path.join(dir, OVERLAY_ARTIFACT_FILENAME)), true);
    const j = JSON.parse(fs.readFileSync(path.join(dir, OVERLAY_ARTIFACT_FILENAME), "utf8"));
    assert.equal(j.overlay_mode, OVERLAY_MODE.SHADOW);
    assert.ok(Array.isArray(j.graph_deterministic_order));
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY;
    else process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("artefacto JSON inválido: ignorado sem crash", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-over-"));
  try {
    fs.writeFileSync(path.join(dir, "execution-graph-scheduler-report.json"), "NOT_JSON {{{", "utf8");
    const m = buildPipelineOverlayModel({ outputDir: dir, runId: "r6" });
    assert.ok(m.graph_deterministic_order.length > 0);
    assert.equal(m.loaded_artifacts.has_scheduler_report, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("overlay consistent (análise unitária sem avisos estruturais)", () => {
  const det = ["n-scan", "n-architect", "n-execution-plan"];
  const p = computeOverlayStatusAndMessages({
    linearOrder: ["n-scan", "n-architect", "n-execution-plan"],
    deterministicOrder: det,
    schedulerOrder: det,
    runtimeDoc: { transitions: [{ seq: 1, node_id: "n-scan" }] },
    fingerprintResult: { ok: true, errors: [] },
    schedulerDuplicateNodes: [],
    linearOrphans: [],
  });
  assert.equal(p.overlay_status, OVERLAY_STATUS.CONSISTENT);
});

test("missing node detection: linear vazio → todos os nós em falta na lista", () => {
  const bogus = path.join(os.tmpdir(), `eg-overlay-m-${Date.now()}`);
  const m = buildPipelineOverlayModel({ outputDir: bogus, runId: "m1" });
  assert.equal(m.node_comparison.missing_from_linear.length, 9);
});

test("orchestration.js não referencia overlay", () => {
  const orch = fs.readFileSync(path.join(__dirname, "../../orchestration.js"), "utf8");
  assert.ok(!orch.includes("graph/overlay"));
  assert.ok(!orch.includes("execution-graph-overlay"));
});

test("buildOverlayReport inclui campos obrigatórios", () => {
  const bogus = path.join(os.tmpdir(), `eg-overlay-missing-${Date.now()}`);
  const m = buildPipelineOverlayModel({ outputDir: bogus, runId: "z" });
  const r = buildOverlayReport(m, { run_id: "z", overlay_mode: OVERLAY_MODE.SHADOW });
  for (const k of [
    "schema_version",
    "run_id",
    "graph_id",
    "graph_fingerprint",
    "overlay_mode",
    "overlay_status",
    "linear_pipeline_order",
    "graph_deterministic_order",
    "scheduler_execution_order",
    "node_comparison",
    "dependency_analysis",
    "transition_analysis",
    "consistency_summary",
    "divergence_summary",
    "warnings",
    "diagnostics",
    "created_at",
  ]) {
    assert.ok(k in r, `missing ${k}`);
  }
});
