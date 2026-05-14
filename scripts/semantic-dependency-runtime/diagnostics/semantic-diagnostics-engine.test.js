/**
 * Semantic diagnostics engine — Fase 4.8.8
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { LifecycleState } = require("../constants");
const { MutationReasonCodes } = require("../overlay/constants");
const { buildDependencyGraphDocument } = require("../graph-manifest");
const { buildSnapshotManifestDocument } = require("../snapshot-manifest");
const {
  GRAPH_MANIFEST_FILENAME,
  GRAPH_SNAPSHOT_MANIFEST_FILENAME,
} = require("../constants");
const {
  SEMANTIC_MUTATION_GRAPH_FILENAME,
  PROPAGATION_MANIFEST_FILENAME,
} = require("../overlay/constants");
const {
  generateSemanticDiagnosticsReport,
  semanticDiagnosticsCanonicalFingerprint,
} = require("./semantic-diagnostics-engine");
const { VALIDATION_PROPAGATION_MANIFEST_FILENAME } = require("../../execution-plan/validation-targeting/constants");

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function fp64(repeated) {
  return String(repeated).repeat(64).slice(0, 64);
}

test("determinismo — fingerprint canónico estável entre duas gerações", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sem-diag-"));

  const genPol = {
    version: "p/1",
    unresolved_imports: [{ from_relative: "a.ts", specifier: "./missing" }],
  };
  const graph = buildDependencyGraphDocument({
    graphId: "g-diag",
    lifecycleState: LifecycleState.SNAPSHOTTED,
    nodes: [{ id: "n1", kind: "file", path: "a.ts", language: "typescript" }],
    edges: [],
    generationPolicy: genPol,
  });

  writeJson(path.join(dir, GRAPH_MANIFEST_FILENAME), graph);

  const snap = buildSnapshotManifestDocument({
    snapshotId: "snap-diag",
    graphId: graph.graph_id,
    graphFingerprintSha256: graph.graph_fingerprint_sha256,
    generationPolicy: graph.generation_policy,
    inputsDigest: "test-inputs-digest-hex-need-16chars-minimum-xx",
    createdAt: "2026-05-13T10:00:00.000Z",
  });
  writeJson(path.join(dir, GRAPH_SNAPSHOT_MANIFEST_FILENAME), snap);

  const mut = {
    schema_version: "semantic-mutation-graph/1",
    overlay_id: "ov1",
    graph_id: graph.graph_id,
    graph_fingerprint_ref: graph.graph_fingerprint_sha256,
    propagation_fingerprint_sha256: fp64("a"),
    roots: [{ path: "a.ts", reason_codes: ["direct_change"], missing_from_graph: false }],
    propagation_summary: {
      impacted_nodes_count: 2,
      impacted_edges_count: 1,
    },
    impacted_nodes: [
      {
        node_id: "n1",
        path: "a.ts",
        reason_codes: [MutationReasonCodes.DIRECT_CHANGE],
        distance_from_root: 0,
        discovered_from: "a.ts",
      },
      {
        node_id: "n2",
        path: "b.ts",
        reason_codes: [MutationReasonCodes.IMPORT_REACH],
        distance_from_root: 1,
        discovered_from: "a.ts",
      },
    ],
    impacted_edges: [],
    limits_snapshot: { max_hops: 4, max_nodes: 100, max_edges: 200, enable_reverse_reach: true },
    limits_execution: {
      forward: {
        max_edges_hit: true,
        max_nodes_hit: false,
        max_hops_truncated_neighbor_skips: 2,
      },
    },
    created_at: "2026-05-13T12:00:00.000Z",
  };
  writeJson(path.join(dir, SEMANTIC_MUTATION_GRAPH_FILENAME), mut);

  writeJson(path.join(dir, PROPAGATION_MANIFEST_FILENAME), {
    schema_version: "propagation-manifest/1",
    impacted_paths: ["a.ts", "b.ts"],
    propagation_fingerprint_sha256: fp64("b"),
  });

  writeJson(path.join(dir, VALIDATION_PROPAGATION_MANIFEST_FILENAME), {
    schema_version: "validation-propagation-manifest/1",
    propagation_mode: "shadow",
    semantic_candidates: [{ path: "b.ts" }],
    expanded_targets: [
      { expansion_source: "semantic_shadow_candidate", file: "b.ts" },
      { expansion_source: "original_validation_targeting", file: "a.ts" },
    ],
    propagation_fingerprint_sha256: fp64("a"),
  });

  writeJson(path.join(dir, "risk-runtime-manifest.json"), {
    semantic_propagation: {
      propagation_mode: "shadow",
      telemetry: { semantic_risk_propagation_skipped: true },
      semantic_risk_classification: "local",
      semantic_risk_metrics: { impacted_nodes_count: 2 },
    },
  });

  const a = generateSemanticDiagnosticsReport(dir, { includeGeneratedAt: false });
  const b = generateSemanticDiagnosticsReport(dir, { includeGeneratedAt: false });

  assert.equal(semanticDiagnosticsCanonicalFingerprint(a), semanticDiagnosticsCanonicalFingerprint(b));

  assert.ok(a.graph_summary.unresolved_imports_count >= 1);
  assert.ok(a.inconsistencies_sorted.some((x) => /propagation-manifest/.test(x) && /difere/.test(x)));

  const limExp = a.limits_applied.explanations_sorted;
  assert.ok(limExp.some((s) => /max_edges/.test(s)));
  assert.ok(limExp.some((s) => /vizinho/.test(s) || /hops/.test(s)));

  const px = a.path_explanations_sorted.find((r) => r.path === "b.ts");
  assert.ok(px);
  assert.ok(px.explanation_parts_sorted.some((t) => /IMPORT_REACH|import/i.test(t)));

  const valInt = a.runtime_integrations_summary.integrations_sorted.find((x) => x.runtime === "validation");
  assert.ok(valInt);
  assert.equal(valInt.semantic_candidates_count, 1);
  assert.equal(valInt.semantic_shadow_targets_count, 1);

  const riskInt = a.runtime_integrations_summary.integrations_sorted.find((x) => x.runtime === "risk");
  assert.ok(riskInt.semantic_classification);
});

test("grafo dependency-graph inválido aparece nas inconsistências", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sem-diag-bad-"));
  writeJson(path.join(dir, GRAPH_MANIFEST_FILENAME), { schema_version: "wrong", nodes: [] });

  const r = generateSemanticDiagnosticsReport(dir, { includeGeneratedAt: false });
  assert.ok(r.inconsistencies_sorted.length > 0);
});
