"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { NODE_ID } = require("../constants");
const { buildInitialRuntimeSnapshot } = require("../runtime-state/snapshot-builder");
const { applyRuntimeTransition, resetGlobalTransitionSeqForTests } = require("../runtime-state/transition-engine");
const { RUNTIME_NODE_STATUS } = require("../runtime-state/constants");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const { EDGE_KIND } = require("../constants");
const { SCHEDULER_ARTIFACT_FILENAME, SCHEDULER_ADVISORY_SOURCE } = require("./constants");
const {
  computeDeterministicSchedulingOrder,
  getSchedulingEdges,
  buildSchedulingIncomingMap,
} = require("./dependency-resolver");
const { resolveReadyPendingNodeIds } = require("./ready-node-resolver");
const { validateSchedulerInputs } = require("./validators");
const { runSerialAdvisoryScheduler } = require("./scheduler-engine");
const { tryWriteShadowSchedulerReport } = require("./shadow-hook");

test.afterEach(() => {
  resetGlobalTransitionSeqForTests(0);
});

test("primeiro ready: apenas scan (sem deps de entrada)", () => {
  const g = buildCanonicalExecutionGraph();
  const doc = buildInitialRuntimeSnapshot(g, { run_id: "t1", now_iso: "2026-01-01T00:00:00.000Z" });
  const order = computeDeterministicSchedulingOrder(g);
  const idx = new Map(order.map((id, i) => [id, i]));
  const ready = resolveReadyPendingNodeIds(g, doc, idx);
  assert.deepEqual(ready, [NODE_ID.SCAN]);
});

test("traversal segue deterministic_order (grafo canónico completo)", () => {
  const g = buildCanonicalExecutionGraph();
  const doc = buildInitialRuntimeSnapshot(g, { run_id: "t2", now_iso: "2026-01-01T00:00:00.000Z" });
  const r = runSerialAdvisoryScheduler(g, doc);
  assert.equal(r.ok, true);
  const order = computeDeterministicSchedulingOrder(g);
  assert.deepEqual(r.executed_nodes, order);
});

test("execução serial: no máximo um nó em running entre transições globais", () => {
  const g = buildCanonicalExecutionGraph();
  const doc = buildInitialRuntimeSnapshot(g, { run_id: "t3", now_iso: "2026-01-01T00:00:00.000Z" });
  const r = runSerialAdvisoryScheduler(g, doc);
  assert(r.advisory_doc);
  const transitions = r.advisory_doc.transitions || [];
  const byNode = new Map();
  for (const n of r.advisory_doc.nodes_runtime_state || []) {
    byNode.set(n.node_id, RUNTIME_NODE_STATUS.PENDING);
  }
  for (const t of transitions) {
    byNode.set(t.node_id, t.to);
    let running = 0;
    for (const nid of byNode.keys()) {
      if (byNode.get(nid) === RUNTIME_NODE_STATUS.RUNNING) running += 1;
    }
    assert.ok(running <= 1, "não pode haver >1 nó em running (serial)");
  }
});

test("repeat_edges não entram nas dependências; listadas no engine", () => {
  const g = buildCanonicalExecutionGraph();
  const inc = buildSchedulingIncomingMap(g);
  assert.equal((inc.get(NODE_ID.EXECUTOR) || new Set()).has(NODE_ID.CORRECTION), false);
  assert.ok((g.repeat_edges || []).length > 0);
  const doc = buildInitialRuntimeSnapshot(g, { run_id: "t4", now_iso: "2026-01-01T00:00:00.000Z" });
  const r = runSerialAdvisoryScheduler(g, doc);
  assert.deepEqual(r.skipped_repeat_edges, g.repeat_edges);
  assert.equal(r.diagnostics.scheduler_uses_repeat_edges, false);
});

test("nó com dependência ainda pendente não é ready", () => {
  const g = buildCanonicalExecutionGraph();
  const doc = buildInitialRuntimeSnapshot(g, { run_id: "t5", now_iso: "2026-01-01T00:00:00.000Z" });
  const order = computeDeterministicSchedulingOrder(g);
  const idx = new Map(order.map((id, i) => [id, i]));
  const ready0 = resolveReadyPendingNodeIds(g, doc, idx);
  assert.deepEqual(ready0, [NODE_ID.SCAN]);
  const at = "2026-01-02T00:00:00.000Z";
  for (const step of [
    RUNTIME_NODE_STATUS.READY,
    RUNTIME_NODE_STATUS.RUNNING,
    RUNTIME_NODE_STATUS.COMPLETED,
  ]) {
    assert.ok(applyRuntimeTransition(doc, { node_id: NODE_ID.SCAN, to: step, at }).ok);
  }
  const ready1 = resolveReadyPendingNodeIds(g, doc, idx);
  assert.ok(!ready1.includes(NODE_ID.EXECUTION_PLAN));
  assert.ok(ready1.includes(NODE_ID.ARCHITECT));
});

test("graph/runtime mismatch falha de forma controlada", () => {
  const g = buildCanonicalExecutionGraph();
  const doc = buildInitialRuntimeSnapshot(g, { run_id: "t6", now_iso: "2026-01-01T00:00:00.000Z" });
  doc.graph_fingerprint = "0".repeat(64);
  const v = validateSchedulerInputs(g, doc);
  assert.equal(v.ok, false);
  const r = runSerialAdvisoryScheduler(g, doc);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
});

test("feature flag off: não gera execution-graph-scheduler-report.json", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER;
  process.env.SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER = "off";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "egsched-"));
  try {
    tryWriteShadowSchedulerReport({ outputDir: dir, runId: "x-off" });
    const p = path.join(dir, SCHEDULER_ARTIFACT_FILENAME);
    assert.equal(fs.existsSync(p), false);
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER;
    else process.env.SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("feature flag shadow: gera relatório", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER;
  process.env.SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER = "shadow";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "egsched-"));
  try {
    tryWriteShadowSchedulerReport({ outputDir: dir, runId: "x-shadow" });
    const p = path.join(dir, SCHEDULER_ARTIFACT_FILENAME);
    assert.equal(fs.existsSync(p), true);
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.equal(j.scheduler_mode, "shadow");
    assert.ok(Array.isArray(j.executed_nodes));
    assert.ok(Array.isArray(j.skipped_repeat_edges));
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER;
    else process.env.SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestration.js não referencia o scheduler do execution graph", () => {
  const orch = fs.readFileSync(
    path.join(__dirname, "../../orchestration.js"),
    "utf8",
  );
  assert.ok(!orch.includes("graph/scheduler"));
  assert.ok(!orch.includes("execution-graph-scheduler"));
});

test("dependentes desbloqueiam após completed (cadeia scan→architect)", () => {
  const g = buildCanonicalExecutionGraph();
  const doc = buildInitialRuntimeSnapshot(g, { run_id: "t7", now_iso: "2026-01-01T00:00:00.000Z" });
  const order = computeDeterministicSchedulingOrder(g);
  const idx = new Map(order.map((id, i) => [id, i]));
  const at = "2026-01-01T00:00:00.000Z";
  for (const st of [RUNTIME_NODE_STATUS.READY, RUNTIME_NODE_STATUS.RUNNING, RUNTIME_NODE_STATUS.COMPLETED]) {
    applyRuntimeTransition(doc, { node_id: NODE_ID.SCAN, to: st, at });
  }
  const ready = resolveReadyPendingNodeIds(g, doc, idx);
  assert.deepEqual(ready, [NODE_ID.ARCHITECT]);
});

test("getSchedulingEdges só usa graph.edges (não repeat_edges)", () => {
  const g = buildCanonicalExecutionGraph();
  const se = getSchedulingEdges(g);
  assert.ok(se.every((e) => e.from !== NODE_ID.CORRECTION || e.to !== NODE_ID.EXECUTOR));
  const fromDocEdges = (g.edges || []).map((e) => ({
    from: e.from,
    to: e.to,
    kind: e.kind,
    condition: e.condition,
  }));
  const fp = computeExecutionGraphFingerprint({
    schema_version: g.schema_version,
    pipeline_variant: g.pipeline_variant,
    nodes: g.nodes,
    edges: fromDocEdges,
    repeat_edges: [],
  });
  assert.ok(typeof fp === "string" && fp.length === 64);
});

test("scheduler não invoca handlers: só meta advisory na transição", () => {
  const g = buildCanonicalExecutionGraph();
  const doc = buildInitialRuntimeSnapshot(g, { run_id: "t8", now_iso: "2026-01-01T00:00:00.000Z" });
  const r = runSerialAdvisoryScheduler(g, doc);
  assert.equal(r.diagnostics.real_pipeline_handlers_invoked, false);
  for (const row of r.advisory_doc.nodes_runtime_state || []) {
    for (const rec of row.transition_history || []) {
      assert.equal(rec.meta && rec.meta.source, SCHEDULER_ADVISORY_SOURCE);
    }
  }
});
