"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stableNodeIdFromRelativePath } = require("../plugins/js-ts/relative-resolver");

const {
  buildSemanticMutationOverlayDocument,
  buildPropagationProjectionManifest,
  persistSemanticMutationArtifacts,
  loadSemanticMutationGraph,
  loadPropagationManifest,
  MutationReasonCodes,
} = require("./semantic-mutation-overlay");

const FP64 = "a".repeat(64);

function tinyChainGraph(len) {
  /** @type {object[]} */
  const nodes = [];
  /** @type {object[]} */
  const edges = [];
  for (let i = 1; i <= len; i += 1) {
    const rel = `pkg/f${i}.ts`;
    const id = stableNodeIdFromRelativePath(rel);
    nodes.push({
      id,
      kind: "file",
      path: rel,
      language: "typescript",
      metadata: { analyzer: "test" },
    });
    if (i > 1) {
      const prevPath = `pkg/f${i - 1}.ts`;
      edges.push({
        from: stableNodeIdFromRelativePath(prevPath),
        to: id,
        kind: "static_relative_import",
        reason: "js_ts:test",
      });
    }
  }
  return {
    schema_version: "semantic-dependency-graph/1",
    graph_id: "gtest",
    graph_fingerprint_sha256: FP64,
    lifecycle_state: "REQUESTED",
    nodes,
    edges,
    generation_policy: { version: "test" },
  };
}

test("propagação directa + transitiva (forward)", () => {
  const g = tinyChainGraph(3);
  const o = buildSemanticMutationOverlayDocument({
    dependencyGraphDoc: g,
    executorChanges: [{ path: "pkg/f1.ts" }],
    limits: { max_hops: 12, max_nodes: 80, max_edges: 120, enable_reverse_reach: false },
  });
  assert.ok(o.impacted_edges.length >= 2);
  assert.ok(o.impacted_nodes.every((/** @type {any}**/ n) => n.reason_codes && n.reason_codes.length));
});

test("reverse reach acrescenta arestas em relação a forward-only", () => {
  const g = tinyChainGraph(3);
  const fOnly = buildSemanticMutationOverlayDocument({
    dependencyGraphDoc: g,
    explicitRoots: ["pkg/f3.ts"],
    limits: { max_hops: 4, max_edges: 50, max_nodes: 80, enable_reverse_reach: false },
  });
  const withRev = buildSemanticMutationOverlayDocument({
    dependencyGraphDoc: g,
    explicitRoots: ["pkg/f3.ts"],
    limits: { max_hops: 4, max_edges: 50, max_nodes: 80, enable_reverse_reach: true },
    overlayId: "ov-rev-1",
    createdAt: "2026-05-01T00:00:00.000Z",
  });
  assert.ok(withRev.impacted_edges.length >= fOnly.impacted_edges.length);
  assert.ok(
    withRev.impacted_nodes.some((/** @type {any}**/ n) =>
      n.reason_codes.includes(MutationReasonCodes.REVERSE_IMPORT_REACH),
    ),
  );
});

test("roots vindos do reconciliation unexpected + unmatched", () => {
  const g = tinyChainGraph(2);
  const o = buildSemanticMutationOverlayDocument({
    dependencyGraphDoc: g,
    reconciliation: {
      unexpected_changes: [{ path: "pkg/ghost.ts" }],
      unmatched_operations: [{ path: "pkg/f2.ts" }],
    },
    limits: { max_edges: 20, max_hops: 4, max_nodes: 80, enable_reverse_reach: false },
  });

  assert.ok(o.roots.some((/** @type {any}**/ r) => r.path === "pkg/ghost.ts"));
  assert.ok(
    o.roots.some((/** @type {any}**/ r) =>
      r.reason_codes.includes(MutationReasonCodes.RECONCILIATION_UNEXPECTED),
    ),
  );
  assert.ok(
    o.roots.some((/** @type {any}**/ r) =>
      r.reason_codes.includes(MutationReasonCodes.RECONCILIATION_UNMATCHED),
    ),
  );
});

test("fingerprints determinísticos com overlay_id + timestamps iguais (dedupe raízes executor)", () => {
  const g = tinyChainGraph(2);
  const iso = "2026-06-06T06:06:06.666Z";

  const a = buildSemanticMutationOverlayDocument({
    dependencyGraphDoc: g,
    executorChanges: [{ path: "pkg/f1.ts" }, { path: "pkg/f1.ts" }],
    explicitRoots: [],
    overlayId: "deterministic-overlay",
    createdAt: iso,
    limits: { max_hops: 4, max_edges: 30, max_nodes: 80, enable_reverse_reach: false },
  });

  const b = buildSemanticMutationOverlayDocument({
    dependencyGraphDoc: g,
    executorChanges: [{ path: "pkg/f1.ts" }],
    overlayId: "deterministic-overlay",
    createdAt: iso,
    limits: { max_hops: 4, max_edges: 30, max_nodes: 80, enable_reverse_reach: false },
  });

  assert.strictEqual(a.propagation_fingerprint_sha256, b.propagation_fingerprint_sha256);
});

test("limits max_edges restringem o número de arestas", () => {
  const g = tinyChainGraph(4);
  const full = buildSemanticMutationOverlayDocument({
    dependencyGraphDoc: g,
    executorChanges: [{ path: "pkg/f1.ts" }],
    limits: { max_edges: 200, max_hops: 20, max_nodes: 120, enable_reverse_reach: false },
  });
  const cap = buildSemanticMutationOverlayDocument({
    dependencyGraphDoc: g,
    executorChanges: [{ path: "pkg/f1.ts" }],
    limits: { max_edges: 1, max_hops: 20, max_nodes: 120, enable_reverse_reach: false },
  });
  assert.ok(cap.impacted_edges.length <= full.impacted_edges.length);
  assert.strictEqual(cap.impacted_edges.length, 1);
});

test("persistência dos manifests JSON", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smo-fs-"));

  try {
    const g = tinyChainGraph(2);
    const ov = buildSemanticMutationOverlayDocument({
      dependencyGraphDoc: g,
      executorChanges: [{ path: "pkg/f1.ts" }],
      limits: { enable_reverse_reach: true, max_edges: 30, max_hops: 6, max_nodes: 90 },
      overlayId: "persist-overlay",
      createdAt: "2026-05-07T07:07:07.077Z",
    });
    const pm = buildPropagationProjectionManifest(ov);
    persistSemanticMutationArtifacts(dir, ov, pm);

    const rg = loadSemanticMutationGraph(dir);
    const rp = loadPropagationManifest(dir);

    assert.ok(rg.impacted_edges.length >= 1);
    assert.strictEqual(rp.overlay_id, ov.overlay_id);
    assert.strictEqual(pm.propagation_fingerprint_sha256, ov.propagation_fingerprint_sha256);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
