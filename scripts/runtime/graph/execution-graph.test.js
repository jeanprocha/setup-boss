"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildCanonicalExecutionGraph,
  deterministicTopologicalOrder,
} = require("./graph-builder.js");
const { computeExecutionGraphFingerprint } = require("./fingerprint.js");
const {
  hasHardEdgeCycle,
  hasCycle,
  findUnreachableFromRoots,
  validateExecutionGraphDoc,
} = require("./graph-validation.js");
const { buildExecutionGraphDocument } = require("./artifact-writer.js");
const { getExecutionGraphModeFromEnv } = require("./feature-flags.js");
const { tryWriteShadowExecutionGraphArtifact } = require("./shadow-hook.js");
const { ARTIFACT_FILENAME } = require("./constants.js");
const { NODE_ID } = require("./constants.js");

describe("execution graph 4.12.1", () => {
  it("builder: nine nodes; scan precedes architect in hard topo order", () => {
    const g = buildCanonicalExecutionGraph();
    assert.equal(g.nodes.length, 9);
    const order = deterministicTopologicalOrder(g);
    assert.ok(order.indexOf(NODE_ID.SCAN) < order.indexOf(NODE_ID.ARCHITECT));
    assert.ok(order.indexOf(NODE_ID.EXECUTOR) < order.indexOf(NODE_ID.REVIEW));
  });

  it("fingerprint: idêntico entre duas construções; não varia com annotation do doc", () => {
    const a = buildCanonicalExecutionGraph();
    const b = buildCanonicalExecutionGraph();
    assert.equal(computeExecutionGraphFingerprint(a), computeExecutionGraphFingerprint(b));

    const d1 = buildExecutionGraphDocument(a, { run_id: "run-a" });
    const d2 = buildExecutionGraphDocument(a, { run_id: "run-b" });
    assert.equal(d1.graph_fingerprint_sha256, d2.graph_fingerprint_sha256);
  });

  it("dependencies: ordem determinística do backbone hard", () => {
    const g = buildCanonicalExecutionGraph();
    const order = deterministicTopologicalOrder(g);

    const hardSpine = [
      NODE_ID.SCAN,
      NODE_ID.ARCHITECT,
      NODE_ID.EXECUTION_PLAN,
      NODE_ID.EXECUTOR,
      NODE_ID.VALIDATION_PLAN,
      NODE_ID.VALIDATOR_EXECUTOR,
      NODE_ID.REVIEW,
    ];

    const pos = (id) => order.indexOf(id);
    for (let i = 0; i < hardSpine.length - 1; i++) {
      assert.ok(pos(hardSpine[i]) < pos(hardSpine[i + 1]), `order ${hardSpine[i]} before ${hardSpine[i + 1]}`);
    }
  });

  it("ciclo simples: detetado em arestas hard sintéticas", () => {
    const g = buildCanonicalExecutionGraph();
    assert.equal(hasHardEdgeCycle(g), false);
    const bad = {
      nodes: g.nodes,
      edges: [
        ...g.edges,
        { from: NODE_ID.REVIEW, to: NODE_ID.SCAN, kind: "hard" },
      ],
    };
    assert.equal(hasHardEdgeCycle(bad), true);
  });

  it("repeat_edges: ciclo executor←correction não contamina hard DAG", () => {
    const g = buildCanonicalExecutionGraph();
    const repeat = (g.repeat_edges || []).map((e) => ({ from: e.from, to: e.to }));
    assert.equal(hasHardEdgeCycle(g), false);
    assert.equal(hasCycle(g.nodes.map((n) => n.node_id), [...g.edges, ...repeat]), true);
  });

  it("órfãos hard: correction e knowledge não são alcançáveis só por hard desde scan", () => {
    const g = buildCanonicalExecutionGraph();
    const unreachable = findUnreachableFromRoots([NODE_ID.SCAN], g);
    assert.ok(unreachable.includes(NODE_ID.CORRECTION));
    assert.ok(unreachable.includes(NODE_ID.KNOWLEDGE));
  });

  it("feature flag: default off; shadow tenta escrever artefacto", () => {
    const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exgraph-"));
    try {
      delete process.env.SETUP_BOSS_EXECUTION_GRAPH;
      assert.equal(getExecutionGraphModeFromEnv(), "off");
      tryWriteShadowExecutionGraphArtifact({ outputDir: dir, runId: "x" });
      assert.equal(fs.existsSync(path.join(dir, ARTIFACT_FILENAME)), false);

      process.env.SETUP_BOSS_EXECUTION_GRAPH = "shadow";
      assert.equal(getExecutionGraphModeFromEnv(), "shadow");
      tryWriteShadowExecutionGraphArtifact({
        outputDir: dir,
        runId: "20260101-test",
        pipelineStatus: "completed",
        correctionIterations: 0,
        source: "test",
      });
      assert.ok(fs.existsSync(path.join(dir, ARTIFACT_FILENAME)));
      const raw = JSON.parse(fs.readFileSync(path.join(dir, ARTIFACT_FILENAME), "utf8"));
      assert.equal(raw.run.run_id, "20260101-test");
      assert.ok(raw.graph_fingerprint_sha256 && raw.graph_fingerprint_sha256.length === 64);
    } finally {
      if (prev === undefined) delete process.env.SETUP_BOSS_EXECUTION_GRAPH;
      else process.env.SETUP_BOSS_EXECUTION_GRAPH = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validateExecutionGraphDoc rejeita doc com ciclo hard", () => {
    const g = buildCanonicalExecutionGraph();
    const doc = buildExecutionGraphDocument(g, {});
    doc.edges.push({ from: NODE_ID.REVIEW, to: NODE_ID.SCAN, kind: "hard" });
    const v = validateExecutionGraphDoc(doc);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /ciclo/i.test(e)));
  });
});
