"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { NODE_ID, EDGE_KIND } = require("../constants");
const { buildInitialRuntimeSnapshot } = require("../runtime-state/snapshot-builder");
const { analyzeCycles } = require("./cycle-validator");
const { analyzeIntegrity } = require("./integrity-validator");
const { analyzeDeadlock } = require("./deadlock-detector");
const { analyzeReplayLoops } = require("./replay-loop-detector");
const { runRiskAnalysis } = require("./risk-analyzer");
const { buildRiskReport } = require("./risk-report-builder");
const { tryWriteShadowRiskReport } = require("./shadow-hook");
const { getExecutionGraphRiskModeFromEnv } = require("./feature-flags");
const { RISK_MODE, RISK_LEVEL } = require("./constants");
const { tryReadJsonFile } = require("./safe-json");

test("cycle detection: hard edge cycle → critical signal", () => {
  const g = {
    nodes: [{ node_id: "a", kind: "x" }, { node_id: "b", kind: "y" }],
    edges: [
      { from: "a", to: "b", kind: EDGE_KIND.HARD },
      { from: "b", to: "a", kind: EDGE_KIND.HARD },
    ],
    repeat_edges: [],
  };
  const c = analyzeCycles(g);
  assert.equal(c.hard_edge_cycle, true);
  assert.equal(c.scheduling_edge_cycle, true);
});

test("orphan detection: fonte inesperada além de scan", () => {
  const g = {
    nodes: [
      { node_id: NODE_ID.SCAN, kind: "scan" },
      { node_id: NODE_ID.ARCHITECT, kind: "architect" },
      { node_id: "n-orphan", kind: "scan" },
    ],
    edges: [{ from: NODE_ID.SCAN, to: NODE_ID.ARCHITECT, kind: EDGE_KIND.HARD }],
    repeat_edges: [],
  };
  const i = analyzeIntegrity(g, null, null);
  assert.ok(i.unexpected_source_orphans.includes("n-orphan"));
});

test("deadlock: scheduler stuck signal", () => {
  const g = buildCanonicalExecutionGraph();
  const d = analyzeDeadlock(g, { ok: false, blocked_nodes: ["n-x", "n-y"] }, null);
  assert.equal(d.scheduling_stuck_signal, true);
});

test("replay loop: duplicados em gerações", () => {
  const r = analyzeReplayLoops({
    diagnostics: [],
    replay_generations: [
      { generation: 0, node_ids: [NODE_ID.EXECUTOR] },
      { generation: 1, node_ids: [NODE_ID.EXECUTOR, NODE_ID.REVIEW] },
    ],
  });
  assert.ok(r.duplicate_generation_nodes.includes(NODE_ID.EXECUTOR));
});

test("replay loop: traversal cycle diagnostic", () => {
  const r = analyzeReplayLoops({
    diagnostics: [{ code: "replay_traversal_cycle", detail: "x" }],
    replay_generations: [],
  });
  assert.equal(r.traversal_cycle_flag, true);
});

test("blocked chain: amostra com runtime blocked", () => {
  const g = buildCanonicalExecutionGraph();
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t", now_iso: new Date().toISOString() });
  const row = rt.nodes_runtime_state.find((x) => x.node_id === NODE_ID.REVIEW);
  if (row) row.current_status = "blocked";
  const d = analyzeDeadlock(g, { ok: true, blocked_nodes: [] }, rt);
  assert.ok(Array.isArray(d.blocked_upstream_sample_chains));
});

test("invalid transitions: seq fora de ordem", () => {
  const g = buildCanonicalExecutionGraph();
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t2", now_iso: new Date().toISOString() });
  rt.transitions = [{ seq: 2, node_id: "x" }, { seq: 1, node_id: "y" }];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-risk-tr-"));
  fs.writeFileSync(path.join(dir, "execution-graph-runtime.json"), JSON.stringify(rt), "utf8");
  const a = runRiskAnalysis(g, dir, "t2");
  assert.ok(a.detected_risks.some((r) => r.code === "transition_log_invalid"));
});

test("graceful degradation: dir vazio ainda produz relatório low + warnings", () => {
  const g = buildCanonicalExecutionGraph();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-risk-empty-"));
  const a = runRiskAnalysis(g, dir, "run1");
  assert.equal(a.overall_risk_level, RISK_LEVEL.LOW);
  assert.ok(Array.isArray(a.warnings));
  const rep = buildRiskReport(a, { risk_mode: RISK_MODE.SHADOW });
  assert.ok(rep.schema_version >= 1);
  assert.ok(rep.detected_risks);
  assert.ok(rep.deadlock_analysis);
  assert.ok(rep.cycle_analysis);
  assert.ok(rep.replay_loop_analysis);
  assert.ok(rep.orphan_analysis);
  assert.ok(rep.blocked_chain_analysis);
  assert.ok(rep.integrity_summary);
  assert.ok(rep.diagnostics);
  assert.ok(rep.created_at);
});

test("fingerprint mismatch runtime vs canónico", () => {
  const g = buildCanonicalExecutionGraph();
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t3", now_iso: new Date().toISOString() });
  rt.graph_fingerprint = "00".repeat(32);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-risk-fp-"));
  fs.writeFileSync(path.join(dir, "execution-graph-runtime.json"), JSON.stringify(rt), "utf8");
  const a = runRiskAnalysis(g, dir, "t3");
  assert.ok(a.detected_risks.some((r) => r.code === "fingerprint_mismatch"));
});

test("feature flag default off", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_RISK;
  delete process.env.SETUP_BOSS_EXECUTION_GRAPH_RISK;
  assert.equal(getExecutionGraphRiskModeFromEnv(), RISK_MODE.OFF);
  process.env.SETUP_BOSS_EXECUTION_GRAPH_RISK = prev;
});

test("shadow hook: off não grava", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_RISK;
  process.env.SETUP_BOSS_EXECUTION_GRAPH_RISK = "off";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-risk-off-"));
  tryWriteShadowRiskReport({ outputDir: dir, runId: "r" });
  assert.ok(!fs.existsSync(path.join(dir, "execution-graph-risk-report.json")));
  process.env.SETUP_BOSS_EXECUTION_GRAPH_RISK = prev;
});

test("shadow hook: shadow grava risk report", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_RISK;
  process.env.SETUP_BOSS_EXECUTION_GRAPH_RISK = "shadow";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-risk-sh-"));
  tryWriteShadowRiskReport({ outputDir: dir, runId: "r2" });
  const p = path.join(dir, "execution-graph-risk-report.json");
  assert.ok(fs.existsSync(p));
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(j.compat.real_pipeline_handlers_invoked, false);
  process.env.SETUP_BOSS_EXECUTION_GRAPH_RISK = prev;
});

test("safe JSON: ficheiro inválido não lança", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-risk-badjson-"));
  fs.writeFileSync(path.join(dir, "execution-graph.json"), "{not-json", "utf8");
  const r = tryReadJsonFile(dir, "execution-graph.json");
  assert.equal(r.ok, false);
});

test("overlay divergent → risco alto", () => {
  const g = buildCanonicalExecutionGraph();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-risk-ov-"));
  fs.writeFileSync(
    path.join(dir, "execution-graph-overlay-report.json"),
    JSON.stringify({ overlay_status: "divergent" }),
    "utf8",
  );
  const a = runRiskAnalysis(g, dir, "ov1");
  assert.ok(a.detected_risks.some((r) => r.code === "overlay_divergent"));
});

test("orchestration.js não referencia risk layer", () => {
  const p = path.join(__dirname, "../../../runtime/orchestration.js");
  if (!fs.existsSync(p)) return;
  const src = fs.readFileSync(p, "utf8");
  assert.ok(!src.includes("graph/risk"));
});
