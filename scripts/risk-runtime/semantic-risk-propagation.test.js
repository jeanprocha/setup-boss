/**
 * Semantic risk propagation — Fase 4.8.5.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  MutationReasonCodes,
} = require("../semantic-dependency-runtime/overlay/constants");
const {
  buildSemanticRiskPropagationBlock,
  classifySemanticRiskReach,
  computeSemanticRiskMetricsFingerprint,
  THRESHOLDS,
} = require("./semantic-risk-propagation");
const { runRiskEngine } = require("./engine/risk-engine");

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function baseGraphDoc(extra = {}) {
  return {
    schema_version: "semantic-mutation-graph/1",
    overlay_id: "o1",
    graph_id: "g1",
    graph_fingerprint_ref: "gf",
    roots: [{ path: "src/root.ts", reason_codes: ["direct_change"] }],
    propagation_fingerprint_sha256: "upstream-abc",
    propagation_summary: {
      mutation_roots_paths_total: 1,
      impacted_nodes_count: 3,
      impacted_edges_count: 2,
      forward_unique_nodes_visited: 3,
      reverse_unique_nodes_visited: 0,
      forward_edges_emitted: 2,
      reverse_edges_emitted: 0,
    },
    impacted_nodes: [
      {
        node_id: "nb",
        path: "src/b.ts",
        reason_codes: [MutationReasonCodes.IMPORT_REACH],
        distance_from_root: 1,
        discovered_from: "src/root.ts",
      },
      {
        node_id: "na",
        path: "src/root.ts",
        reason_codes: [MutationReasonCodes.DIRECT_CHANGE],
        distance_from_root: 0,
        discovered_from: "src/root.ts",
      },
      {
        node_id: "nz",
        path: "src/z.ts",
        reason_codes: [MutationReasonCodes.REVERSE_IMPORT_REACH],
        distance_from_root: 2,
        discovered_from: "src/root.ts",
      },
    ],
    impacted_edges: [],
    limits_snapshot: {},
    limits_execution: {},
    ...extra,
  };
}

test("shadow off — bloco canonical com skipped true", () => {
  const b = buildSemanticRiskPropagationBlock({
    mode: "off",
    propagationManifestDoc: {},
    semanticGraphDoc: baseGraphDoc(),
  });
  assert.equal(b.propagation_mode, "off");
  assert.equal(b.telemetry.semantic_risk_propagation_skipped, true);
  assert.equal(b.semantic_risk_classification, null);
});

test("shadow — métricas e fingerprint upstream carregadas do grafo", () => {
  const doc = baseGraphDoc();
  const block = buildSemanticRiskPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: { impacted_paths: ["x"], impacted_stats: {} },
    semanticGraphDoc: doc,
  });
  const m = block.semantic_risk_metrics;
  assert.equal(m.impacted_nodes_count, doc.propagation_summary.impacted_nodes_count);
  assert.equal(m.reverse_reach_count, 1);
  assert.equal(m.max_propagation_depth, 2);
  assert.equal(block.propagation_fingerprint_sha256, "upstream-abc");
  assert.equal(block.semantic_risk_classification, classifySemanticRiskReach(m));
});

test("classificação wide por volume de nodes (projection summary)", () => {
  const block = buildSemanticRiskPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: {
      propagation_fingerprint_sha256: "h",
      roots: [{ path: "x" }],
      propagation_summary: { impacted_nodes_count: THRESHOLDS.WIDE_MIN_NODES },
      impacted_nodes: [{ node_id: "n1", path: "a.ts", distance_from_root: 0 }],
    },
  });
  assert.equal(block.semantic_risk_classification, "wide_propagation");
});

test("classificação local — profundidade 1 e números pequenos", () => {
  const block = buildSemanticRiskPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: {
      propagation_fingerprint_sha256: "hf",
      roots: [{ path: "src/a.ts" }],
      propagation_summary: { impacted_nodes_count: 4, impacted_edges_count: 3 },
      impacted_nodes: [
        { node_id: "n2", path: "src/z.ts", reason_codes: [MutationReasonCodes.IMPORT_REACH], distance_from_root: 1 },
        { node_id: "n1", path: "src/a.ts", reason_codes: [MutationReasonCodes.DIRECT_CHANGE], distance_from_root: 0 },
      ],
    },
  });
  assert.equal(block.semantic_risk_classification, "local");
});

test("fingerprints métricas estáveis ao baralhar ordenação lexical de vértices", () => {
  const d1 = baseGraphDoc();
  const d2 = {
    ...d1,
    impacted_nodes: [...d1.impacted_nodes].sort((x, y) => String(y.node_id).localeCompare(String(x.node_id))),
  };

  const a = buildSemanticRiskPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: d1,
  });
  const b = buildSemanticRiskPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: d2,
  });
  assert.equal(
    a.semantic_risk_metrics_fingerprint_sha256,
    b.semantic_risk_metrics_fingerprint_sha256,
  );
});

test("fingerprints diferentes para classificações diferentes", () => {
  const m1 = { impacted_nodes_count: 5, impacted_edges_count: 1, propagation_frontier_size: 2, max_propagation_depth: 1, reverse_reach_count: 0, semantic_roots_count: 1, metrics_basis: "g" };
  const m2 = { ...m1, max_propagation_depth: 15 };
  const f1 = computeSemanticRiskMetricsFingerprint({
    metrics: m1,
    semantic_risk_classification: "local",
    propagation_fingerprint_sha256: null,
  });
  const f2 = computeSemanticRiskMetricsFingerprint({
    metrics: m2,
    semantic_risk_classification: "wide_propagation",
    propagation_fingerprint_sha256: null,
  });
  assert.notEqual(f1, f2);
});

test("shadow sem artefactos — skipped e métricas ausentes no output principal", () => {
  const b = buildSemanticRiskPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: null,
  });
  assert.equal(b.skipped_reason, "missing_semantic_artifacts");
  assert.equal(b.telemetry.semantic_risk_propagation_skipped, true);
  assert.equal(b.telemetry.semantic_risk_metrics_generated, false);
  assert.ok(b.semantic_risk_metrics == null || b.semantic_risk_metrics.metrics_basis !== "semantic_mutation_graph");
});

test("integração risk-engine mantém score e acrescenta semantic_propagation", () => {
  const prevSem = process.env.SETUP_BOSS_SEMANTIC_RISK_PROPAGATION;
  process.env.SETUP_BOSS_SEMANTIC_RISK_PROPAGATION = "shadow";
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-semrisk-"));
    writeJson(path.join(dir, "execution-plan.json"), { plan_id: "p-sem", operations: [{ file: "a.js" }] });
    writeJson(path.join(dir, "executor-changes.json"), []);
    writeJson(path.join(dir, "execution-reconciliation.json"), { status: "ok", unexpected_changes: [], unmatched_operations: [] });
    writeJson(path.join(dir, "validation-results.json"), { validators: [], summary: {} });
    writeJson(path.join(dir, "propagation-manifest.json"), {
      impacted_paths: ["pkg/x.ts"],
      propagation_stats: { impacted_nodes_total: 2 },
    });

    writeJson(path.join(dir, "semantic-mutation-graph.json"), {
      propagation_fingerprint_sha256: "ux",
      roots: [{ path: "pkg/x.ts" }],
      propagation_summary: { impacted_nodes_count: 3, impacted_edges_count: 1 },
      impacted_nodes: [
        { node_id: "nx", path: "pkg/x.ts", distance_from_root: 0, reason_codes: [] },
        {
          node_id: "nz",
          path: "pkg/y.ts",
          distance_from_root: 1,
          reason_codes: [MutationReasonCodes.IMPORT_REACH],
        },
      ],
    });

    const r1 = runRiskEngine({ ctx: null, outputDir: dir, runId: "r1" });
    const r2 = runRiskEngine({ ctx: null, outputDir: dir, runId: "r2" });

    assert.equal(r1.analysis.summary.risk_score, r2.analysis.summary.risk_score);
    assert.ok(r1.manifest.semantic_propagation);
    assert.equal(r1.manifest.semantic_propagation.propagation_mode, "shadow");
    assert.ok(r1.manifest.semantic_propagation.semantic_risk_metrics);
    assert.ok(r1.manifest.semantic_propagation.propagation_summary);
    assert.ok(r1.manifest.semantic_propagation.semantic_risk_metrics_fingerprint_sha256);
    assert.ok(typeof r1.manifest.semantic_propagation.semantic_risk_classification === "string");
  } finally {
    if (prevSem === undefined) delete process.env.SETUP_BOSS_SEMANTIC_RISK_PROPAGATION;
    else process.env.SETUP_BOSS_SEMANTIC_RISK_PROPAGATION = prevSem;
  }
});
