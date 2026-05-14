"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { NODE_ID } = require("../constants");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const { buildInitialRuntimeSnapshot } = require("../runtime-state/snapshot-builder");
const { buildRegisteredAdapterRegistry } = require("../node-adapters/adapter-registry");
const { computeDeterministicSchedulingOrder } = require("../scheduler/dependency-resolver");
const { planGraphReplay, parseReplayTargetsFromEnv, parseReplayBoundaryStopsFromEnv } = require("./replay-planner");
const { tryWriteShadowReplayReport } = require("./shadow-hook");
const {
  getExecutionGraphReplayModeFromEnv,
  isExecutionGraphReplayShadowEnabled,
} = require("./feature-flags");
const { REPLAY_MODE } = require("./constants");
const { buildPipelineOverlayModel } = require("../overlay/overlay-engine");
const { buildOverlayReport } = require("../overlay/overlay-report-builder");
const fs = require("fs");
const os = require("os");
const path = require("path");

test("replay: nó único (executor) → subárvore downstream ordenada", () => {
  const g = buildCanonicalExecutionGraph();
  const { adapters } = buildRegisteredAdapterRegistry(g);
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t1", now_iso: new Date().toISOString() });
  const plan = planGraphReplay({
    structuralGraph: g,
    runtimeSnapshot: rt,
    adapters,
    target_node_ids: [NODE_ID.EXECUTOR],
    boundary_stop_node_ids: [],
  });
  assert.ok(plan.replay_subtree.includes(NODE_ID.EXECUTOR));
  assert.ok(plan.replay_subtree.includes(NODE_ID.REVIEW));
  assert.ok(plan.invalidated_nodes.includes(NODE_ID.REVIEW));
  assert.ok(!plan.invalidated_nodes.includes(NODE_ID.EXECUTOR));
});

test("replay: subtree completa scan→… sem boundary inclui knowledge nos ids (pode estar blocked)", () => {
  const g = buildCanonicalExecutionGraph();
  const { adapters } = buildRegisteredAdapterRegistry(g);
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t2", now_iso: new Date().toISOString() });
  const plan = planGraphReplay({
    structuralGraph: g,
    runtimeSnapshot: rt,
    adapters,
    target_node_ids: [NODE_ID.SCAN],
    boundary_stop_node_ids: [],
  });
  assert.ok(plan.replay_subtree.includes(NODE_ID.KNOWLEDGE));
});

test("replay: invalidação downstream — cada invalidated tem invalidated_by coerente", () => {
  const g = buildCanonicalExecutionGraph();
  const { adapters } = buildRegisteredAdapterRegistry(g);
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t3", now_iso: new Date().toISOString() });
  const plan = planGraphReplay({
    structuralGraph: g,
    runtimeSnapshot: rt,
    adapters,
    target_node_ids: [NODE_ID.EXECUTION_PLAN],
    boundary_stop_node_ids: [],
  });
  const invExecutor = plan.dependency_invalidation.find((x) => x.node_id === NODE_ID.EXECUTOR);
  assert.ok(invExecutor);
  assert.ok(invExecutor.invalidated_by.includes(NODE_ID.EXECUTION_PLAN));
});

test("replay: ordem determinística = filtro da ordem global do scheduler", () => {
  const g = buildCanonicalExecutionGraph();
  const det = computeDeterministicSchedulingOrder(g);
  const { adapters } = buildRegisteredAdapterRegistry(g);
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t4", now_iso: new Date().toISOString() });
  const plan = planGraphReplay({
    structuralGraph: g,
    runtimeSnapshot: rt,
    adapters,
    target_node_ids: [NODE_ID.EXECUTOR],
    boundary_stop_node_ids: [],
  });
  const expected = det.filter((id) => plan.replay_subtree.includes(id));
  assert.deepEqual(plan.replay_order, expected);
});

test("replay: boundary stop em review — não inclui knowledge/correction", () => {
  const g = buildCanonicalExecutionGraph();
  const { adapters } = buildRegisteredAdapterRegistry(g);
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t5", now_iso: new Date().toISOString() });
  const plan = planGraphReplay({
    structuralGraph: g,
    runtimeSnapshot: rt,
    adapters,
    target_node_ids: [NODE_ID.SCAN],
    boundary_stop_node_ids: [NODE_ID.REVIEW],
  });
  assert.ok(plan.replay_boundaries.includes(NODE_ID.REVIEW));
  assert.ok(!plan.replay_subtree.includes(NODE_ID.KNOWLEDGE));
  assert.ok(!plan.replay_subtree.includes(NODE_ID.CORRECTION));
});

test("replay: nós blocked (knowledge) quando na subárvore", () => {
  const g = buildCanonicalExecutionGraph();
  const { adapters } = buildRegisteredAdapterRegistry(g);
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t6", now_iso: new Date().toISOString() });
  const plan = planGraphReplay({
    structuralGraph: g,
    runtimeSnapshot: rt,
    adapters,
    target_node_ids: [NODE_ID.SCAN],
    boundary_stop_node_ids: [],
  });
  assert.ok(plan.replay_blocked_nodes.includes(NODE_ID.KNOWLEDGE));
});

test("replay: capability matrix inclui campos exigidos", () => {
  const g = buildCanonicalExecutionGraph();
  const { adapters } = buildRegisteredAdapterRegistry(g);
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t7", now_iso: new Date().toISOString() });
  const plan = planGraphReplay({
    structuralGraph: g,
    runtimeSnapshot: rt,
    adapters,
    target_node_ids: [NODE_ID.EXECUTOR],
    boundary_stop_node_ids: [],
  });
  const row = plan.replay_capability_matrix[NODE_ID.EXECUTOR];
  assert.equal(typeof row.supports_replay, "boolean");
  assert.equal(typeof row.replay_safe, "boolean");
  assert.equal(typeof row.deterministic, "boolean");
  assert.equal(typeof row.produces_side_effects, "boolean");
  assert.equal(typeof row.resumable, "boolean");
  assert.ok(row.replay_sensitivity);
});

test("replay: ordenação por gerações — executor gen 0 quando alvo", () => {
  const g = buildCanonicalExecutionGraph();
  const { adapters } = buildRegisteredAdapterRegistry(g);
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t8", now_iso: new Date().toISOString() });
  const plan = planGraphReplay({
    structuralGraph: g,
    runtimeSnapshot: rt,
    adapters,
    target_node_ids: [NODE_ID.EXECUTOR],
    boundary_stop_node_ids: [],
  });
  const g0 = plan.replay_generations.find((x) => x.generation === 0);
  assert.ok(g0.node_ids.includes(NODE_ID.EXECUTOR));
});

test("replay: alvo inexistente → diagnóstico replay_target_missing", () => {
  const g = buildCanonicalExecutionGraph();
  const { adapters } = buildRegisteredAdapterRegistry(g);
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t9", now_iso: new Date().toISOString() });
  const plan = planGraphReplay({
    structuralGraph: g,
    runtimeSnapshot: rt,
    adapters,
    target_node_ids: ["n-nope"],
    boundary_stop_node_ids: [],
  });
  assert.ok(plan.diagnostics.some((d) => d.code === "replay_target_missing"));
});

test("replay: feature flag default off", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY;
  delete process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY;
  assert.equal(getExecutionGraphReplayModeFromEnv(), REPLAY_MODE.OFF);
  assert.equal(isExecutionGraphReplayShadowEnabled(), false);
  process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY = prev;
});

test("replay: shadow hook não corre quando flag off", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY;
  process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY = "off";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-replay-"));
  tryWriteShadowReplayReport({ outputDir: dir, runId: "r1" });
  assert.ok(!fs.existsSync(path.join(dir, "execution-graph-replay-report.json")));
  process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY = prev;
});

test("replay: shadow hook escreve artefacto quando shadow", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY;
  process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY = "shadow";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-replay-sh-"));
  tryWriteShadowReplayReport({ outputDir: dir, runId: "r2" });
  const p = path.join(dir, "execution-graph-replay-report.json");
  assert.ok(fs.existsSync(p));
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.ok(Array.isArray(doc.replay_blockers));
  assert.equal(doc.run_id, "r2");
  process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY = prev;
});

test("replay: fingerprint mismatch runtime → diagnóstico", () => {
  const g = buildCanonicalExecutionGraph();
  const { adapters } = buildRegisteredAdapterRegistry(g);
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t10", now_iso: new Date().toISOString() });
  rt.graph_fingerprint = "deadbeef";
  const plan = planGraphReplay({
    structuralGraph: g,
    runtimeSnapshot: rt,
    adapters,
    target_node_ids: [NODE_ID.EXECUTOR],
    boundary_stop_node_ids: [],
  });
  assert.ok(plan.diagnostics.some((d) => d.code === "fingerprint_mismatch"));
});

test("overlay continua a montar modelo sem replay", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ov-"));
  const model = buildPipelineOverlayModel({
    outputDir: dir,
    runId: "x",
  });
  const report = buildOverlayReport(model, { run_id: "x", overlay_mode: "shadow" });
  assert.ok(report.overlay_status === "consistent" || report.overlay_status === "warning" || report.overlay_status === "divergent");
});

test("parseReplayTargetsFromEnv default executor", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY_TARGETS;
  delete process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY_TARGETS;
  assert.deepEqual(parseReplayTargetsFromEnv(), [NODE_ID.EXECUTOR]);
  process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY_TARGETS = prev;
});

test("parseReplayBoundaryStopsFromEnv vazio", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY_BOUNDARY_STOPS;
  delete process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY_BOUNDARY_STOPS;
  assert.deepEqual(parseReplayBoundaryStopsFromEnv(), []);
  process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY_BOUNDARY_STOPS = prev;
});

test("replay: plano advisory não invoca handlers reais (marcador)", () => {
  const g = buildCanonicalExecutionGraph();
  const { adapters } = buildRegisteredAdapterRegistry(g);
  const rt = buildInitialRuntimeSnapshot(g, { run_id: "t11", now_iso: new Date().toISOString() });
  const plan = planGraphReplay({
    structuralGraph: g,
    runtimeSnapshot: rt,
    adapters,
    target_node_ids: [NODE_ID.EXECUTOR],
    boundary_stop_node_ids: [],
  });
  assert.equal(plan.real_pipeline_handlers_invoked, false);
  assert.equal(plan.ok, true);
});
