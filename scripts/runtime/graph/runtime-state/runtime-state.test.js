"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { buildCanonicalExecutionGraph } = require("../graph-builder.js");
const { NODE_ID } = require("../constants.js");
const {
  validateTransitionPair,
} = require("./transitions.js");
const { RUNTIME_NODE_STATUS } = require("./constants.js");
const { buildInitialRuntimeSnapshot } = require("./snapshot-builder.js");
const {
  validateRuntimeStructuralAlignment,
  validateTransitionsLogMonotonic,
  validateTransitionSequence,
  validateNodeTransitionHistoryOrder,
  validateEmbeddedGraphFingerprint,
} = require("./validators.js");
const { validateExecutionGraphRuntimeDocShape } = require("./state-schema.js");
const { applyRuntimeTransition, resetGlobalTransitionSeqForTests } = require("./transition-engine.js");
const { writeExecutionGraphRuntimeArtifact } = require("./artifact-writer.js");
const { computeExecutionGraphFingerprint } = require("../fingerprint.js");
const { tryWriteShadowExecutionGraphRuntimeArtifact } = require("./shadow-hook.js");
const { getExecutionGraphRuntimeModeFromEnv } = require("./feature-flags.js");
const { RUNTIME_ARTIFACT_FILENAME } = require("./constants.js");

const T0 = "2026-01-15T12:00:00.000Z";
const T1 = "2026-01-15T12:00:01.000Z";
const T2 = "2026-01-15T12:00:02.000Z";

describe("graph runtime state 4.12.2", () => {
  beforeEach(() => {
    resetGlobalTransitionSeqForTests(0);
  });

  it("transições válidas: pending→ready, ready→running, running→completed", () => {
    assert.equal(validateTransitionPair("pending", "ready").ok, true);
    assert.equal(validateTransitionPair("ready", "running").ok, true);
    assert.equal(validateTransitionPair("running", "completed").ok, true);
    assert.equal(validateTransitionPair("pending", "blocked").ok, true);
  });

  it("transições inválidas: completed→running, failed→pending, skipped→running", () => {
    assert.equal(validateTransitionPair("completed", "running").ok, false);
    assert.equal(validateTransitionPair("failed", "pending").ok, false);
    assert.equal(validateTransitionPair("skipped", "running").ok, false);
  });

  it("snapshot inicial: todos pending; ordem node_id determinística; lifecycle_summary", () => {
    const g = buildCanonicalExecutionGraph();
    const doc = buildInitialRuntimeSnapshot(g, { run_id: "r1", now_iso: T0, source: "test" });
    assert.ok(doc.nodes_runtime_state.every((n) => n.current_status === RUNTIME_NODE_STATUS.PENDING));
    const ids = doc.nodes_runtime_state.map((n) => n.node_id);
    const sorted = [...ids].sort();
    assert.deepEqual(ids, sorted);
    assert.equal(doc.lifecycle_summary.pending_count, 9);
    assert.equal(doc.lifecycle_summary.total_nodes, 9);
    const v = validateExecutionGraphRuntimeDocShape(doc);
    assert.equal(v.ok, true);
  });

  it("persistência + alinhamento structural/fingerprint", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-egrt-"));
    try {
      const g = buildCanonicalExecutionGraph();
      const doc = buildInitialRuntimeSnapshot(g, { run_id: "run-x", now_iso: T0 });
      writeExecutionGraphRuntimeArtifact(dir, doc);
      const raw = JSON.parse(fs.readFileSync(path.join(dir, RUNTIME_ARTIFACT_FILENAME), "utf8"));
      assert.equal(raw.graph_fingerprint, computeExecutionGraphFingerprint(g));
      const al = validateRuntimeStructuralAlignment(raw, g);
      assert.equal(al.ok, true);
      const emb = validateEmbeddedGraphFingerprint(raw, raw.graph_fingerprint);
      assert.equal(emb.ok, true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fingerprint mismatch: embedded vs principal detetado", () => {
    const g = buildCanonicalExecutionGraph();
    const doc = buildInitialRuntimeSnapshot(g, { run_id: "r", now_iso: T0 });
    doc.graph_fingerprint = "0".repeat(64);
    const emb = validateEmbeddedGraphFingerprint(doc, doc.graph_fingerprint);
    assert.equal(emb.ok, false);
  });

  it("attempts increment ao entrar em running", () => {
    const g = buildCanonicalExecutionGraph();
    const doc = buildInitialRuntimeSnapshot(g, { run_id: "r", now_iso: T0 });
    assert.equal(applyRuntimeTransition(doc, { node_id: NODE_ID.SCAN, to: "ready", at: T0 }).ok, true);
    assert.equal(applyRuntimeTransition(doc, { node_id: NODE_ID.SCAN, to: "running", at: T1 }).ok, true);
    const row = doc.nodes_runtime_state.find((n) => n.node_id === NODE_ID.SCAN);
    assert.equal(row.attempts, 1);
    assert.equal(doc.attempts.by_node_id[NODE_ID.SCAN].execution_attempts, 1);
  });

  it("transitions log: ordem seq monotónica", () => {
    const g = buildCanonicalExecutionGraph();
    const doc = buildInitialRuntimeSnapshot(g, { run_id: "r", now_iso: T0 });
    applyRuntimeTransition(doc, { node_id: NODE_ID.SCAN, to: "ready", at: T0 });
    applyRuntimeTransition(doc, { node_id: NODE_ID.SCAN, to: "running", at: T1 });
    const m = validateTransitionsLogMonotonic(doc.transitions);
    assert.equal(m.ok, true);
    assert.ok(doc.transitions[0].seq < doc.transitions[1].seq);
  });

  it("histórico por nó determinístico (seq crescente)", () => {
    const g = buildCanonicalExecutionGraph();
    const doc = buildInitialRuntimeSnapshot(g, { run_id: "r", now_iso: T0 });
    applyRuntimeTransition(doc, { node_id: NODE_ID.ARCHITECT, to: "ready", at: T0 });
    applyRuntimeTransition(doc, { node_id: NODE_ID.ARCHITECT, to: "running", at: T1 });
    applyRuntimeTransition(doc, { node_id: NODE_ID.ARCHITECT, to: "completed", at: T2 });
    const row = doc.nodes_runtime_state.find((n) => n.node_id === NODE_ID.ARCHITECT);
    const h = validateNodeTransitionHistoryOrder(row.transition_history);
    assert.equal(h.ok, true);
  });

  it("blocked preserva blocked_reason", () => {
    const g = buildCanonicalExecutionGraph();
    const doc = buildInitialRuntimeSnapshot(g, { run_id: "r", now_iso: T0 });
    const r = applyRuntimeTransition(doc, {
      node_id: NODE_ID.REVIEW,
      to: "blocked",
      at: T1,
      blocked_reason: "policy_gate",
    });
    assert.equal(r.ok, true);
    const row = doc.nodes_runtime_state.find((n) => n.node_id === NODE_ID.REVIEW);
    assert.equal(row.blocked_reason, "policy_gate");
    assert.equal(row.current_status, "blocked");
  });

  it("feature flag runtime: off default; shadow escreve ficheiro", () => {
    const prevG = process.env.SETUP_BOSS_EXECUTION_GRAPH;
    const prevR = process.env.SETUP_BOSS_EXECUTION_GRAPH_RUNTIME;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-eflag-"));
    try {
      delete process.env.SETUP_BOSS_EXECUTION_GRAPH_RUNTIME;
      assert.equal(getExecutionGraphRuntimeModeFromEnv(), "off");
      tryWriteShadowExecutionGraphRuntimeArtifact({ outputDir: dir, runId: "x" });
      assert.equal(fs.existsSync(path.join(dir, RUNTIME_ARTIFACT_FILENAME)), false);

      process.env.SETUP_BOSS_EXECUTION_GRAPH_RUNTIME = "shadow";
      tryWriteShadowExecutionGraphRuntimeArtifact({
        outputDir: dir,
        runId: "20260101-z",
        pipelineStatus: "completed",
        correctionIterations: 0,
      });
      assert.ok(fs.existsSync(path.join(dir, RUNTIME_ARTIFACT_FILENAME)));
    } finally {
      if (prevG === undefined) delete process.env.SETUP_BOSS_EXECUTION_GRAPH;
      else process.env.SETUP_BOSS_EXECUTION_GRAPH = prevG;
      if (prevR === undefined) delete process.env.SETUP_BOSS_EXECUTION_GRAPH_RUNTIME;
      else process.env.SETUP_BOSS_EXECUTION_GRAPH_RUNTIME = prevR;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validateTransitionSequence recusa sequência com par inválido", () => {
    const r = validateTransitionSequence([
      { from: "pending", to: "ready" },
      { from: "completed", to: "running" },
    ]);
    assert.equal(r.ok, false);
  });

  it("runtime/graph mismatch: nó extra", () => {
    const g = buildCanonicalExecutionGraph();
    const doc = buildInitialRuntimeSnapshot(g, { run_id: "r", now_iso: T0 });
    doc.nodes_runtime_state.push({
      node_id: "n-ghost",
      kind: "scan",
      current_status: "pending",
      attempts: 0,
      timestamps: {},
      last_transition: null,
      transition_history: [],
      replay_generation: 0,
      blocked_reason: null,
    });
    const al = validateRuntimeStructuralAlignment(doc, g);
    assert.equal(al.ok, false);
  });

  it("transitions fora de ordem no log global: motor rejeita segunda gravação", () => {
    resetGlobalTransitionSeqForTests(0);
    const g = buildCanonicalExecutionGraph();
    const doc = buildInitialRuntimeSnapshot(g, { run_id: "r", now_iso: T0 });
    applyRuntimeTransition(doc, { node_id: NODE_ID.SCAN, to: "ready", at: T0 });
    doc.transitions.push({ seq: 1, node_id: "x", from: "pending", to: "skipped", at: T1 });
    const m = validateTransitionsLogMonotonic(doc.transitions);
    assert.equal(m.ok, false);
  });
});
