"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  LifecycleState,
  NODE_KIND_VALUES,
  EDGE_KIND_VALUES,
} = require("./semantic-dependency-runtime/constants");
const {
  buildDependencyGraphDocument,
  normalizeGraphStructure,
  computeGraphFingerprint,
} = require("./semantic-dependency-runtime/graph-manifest");
const { buildSnapshotManifestDocument } = require("./semantic-dependency-runtime/snapshot-manifest");
const {
  validateDependencyGraph,
  validateSnapshotManifest,
  snapshotCanonicalFingerprint,
} = require("./semantic-dependency-runtime/validation/graph-validation");
const { normalizePathPOSIX } = require("./semantic-dependency-runtime/lib/path-normalize");
const { persistFixtureSemanticGraphArtifacts } = require("./semantic-dependency-runtime/fixture/fixture-graph-builder");

const baseNodes = () => [
  { id: "b", kind: "file", path: "pkg\\two.ts", language: "typescript" },
  { id: "a", kind: "file", path: "pkg/one.ts", language: "typescript" },
];

const baseEdges = () => [
  { from: "a", to: "b", kind: "placeholder_dependency", reason: "fixture" },
];

test("fingerprints estáveis ao reordenar nós e arestas de entrada", () => {
  const g1 = buildDependencyGraphDocument({
    graphId: "g-stable",
    lifecycleState: LifecycleState.SNAPSHOTTED,
    nodes: [...baseNodes()].reverse(),
    edges: [...baseEdges()],
    generationPolicy: { version: "p/1", cap: { max_edges: 100 } },
  });
  const g2 = buildDependencyGraphDocument({
    graphId: "g-stable",
    lifecycleState: LifecycleState.REQUESTED,
    nodes: baseNodes(),
    edges: baseEdges(),
    generationPolicy: { version: "p/1", cap: { max_edges: 100 } },
  });
  assert.strictEqual(g1.graph_fingerprint_sha256, g2.graph_fingerprint_sha256);
});

test("paths normalizados para POSIX antes do fingerprint", () => {
  const n1 = normalizePathPOSIX("a\\b\\c.ts");
  assert.strictEqual(n1, "a/b/c.ts");

  const g = buildDependencyGraphDocument({
    graphId: "g-path",
    lifecycleState: LifecycleState.BUILDING,
    nodes: [{ id: "x", kind: "file", path: "deep\\nested\\f.go", language: "go" }],
    edges: [],
    generationPolicy: { version: "p/1" },
  });
  assert.strictEqual(g.nodes[0].path, "deep/nested/f.go");
});

test("duplicate node id falha na validação", () => {
  const doc = buildDependencyGraphDocument({
    graphId: "gdup",
    lifecycleState: LifecycleState.REQUESTED,
    nodes: [
      { id: "dup", kind: "file", path: "a.ts", language: "ts" },
      { id: "dup", kind: "module", path: "b.ts", language: "ts" },
    ],
    edges: [],
    generationPolicy: { version: "p/1" },
  });
  const v = validateDependencyGraph(doc);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => /duplicado/.test(e)));
});

test("edge órfã (to inexistente) falha na validação", () => {
  const doc = buildDependencyGraphDocument({
    graphId: "gorph",
    lifecycleState: LifecycleState.REQUESTED,
    nodes: [{ id: "only", kind: "file", path: "only.ts", language: "ts" }],
    edges: [{ from: "only", to: "ghost", kind: "import_placeholder", reason: "bad" }],
    generationPolicy: { version: "p/1" },
  });
  const v = validateDependencyGraph(doc);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => /'to'/.test(e) || /desconhecido/.test(e)));
});

test("fingerprint inconsistente é rejeitado", () => {
  const doc = buildDependencyGraphDocument({
    graphId: "g-fp",
    lifecycleState: LifecycleState.SNAPSHOTTED,
    nodes: [{ id: "n1", kind: "file", path: "n1.ts", language: "js" }],
    edges: [],
    generationPolicy: { version: "p/1" },
  });
  const tampered = {
    ...doc,
    nodes: [...doc.nodes, { id: "n2", kind: "file", path: "n2.ts", language: "js" }],
  };
  const v = validateDependencyGraph(tampered);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => /inconsistente/.test(e)));
});

test("snapshot persistido e validável contra grafo + policy digest", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-fixture-"));

  try {
    const r = persistFixtureSemanticGraphArtifacts({
      outputDir: tmp,
      graphId: "g-sn",
      lifecycleState: LifecycleState.SNAPSHOTTED,
      snapshotId: "snap-1",
      inputsDigest: "sha256_fixture_inputs_empty",
      nodes: [{ id: "r1", kind: "package", path: "", language: "-" }],
      edges: [],
      generationPolicy: { version: "p/fixture", flags: {} },
      timestamps: {
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    });

    const graphPath = path.join(tmp, "dependency-graph.json");
    const snapPath = path.join(tmp, "graph-snapshot.json");
    assert.ok(fs.existsSync(graphPath));
    assert.ok(fs.existsSync(snapPath));

    assert.strictEqual(validateDependencyGraph(JSON.parse(fs.readFileSync(graphPath, "utf8"))).ok, true);
    const snapshotOnDisk = JSON.parse(fs.readFileSync(snapPath, "utf8"));
    assert.strictEqual(
      validateSnapshotManifest(snapshotOnDisk, {
        generationPolicy: r.graphDoc.generation_policy,
        graphFingerprintSha256: r.graphDoc.graph_fingerprint_sha256,
      }).ok,
      true,
    );

    const s1 = snapshotCanonicalFingerprint(snapshotOnDisk);
    const rebuilt = buildSnapshotManifestDocument({
      snapshotId: snapshotOnDisk.snapshot_id,
      graphId: snapshotOnDisk.graph_id,
      graphFingerprintSha256: snapshotOnDisk.graph_fingerprint_sha256,
      generationPolicy: r.graphDoc.generation_policy,
      inputsDigest: snapshotOnDisk.inputs_digest,
      schemaVersion: snapshotOnDisk.schema_version,
      createdAt: "2099-01-01T00:00:00.000Z",
    });
    const s2 = snapshotCanonicalFingerprint(rebuilt);
    assert.strictEqual(s1, s2, "canonical snapshot fingerprint deve ignorar created_at");
    assert.strictEqual(r.loadSnapshot().snapshot_id, "snap-1");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("lifecycle válido aceito; inválido rejeitado", () => {
  const okDoc = buildDependencyGraphDocument({
    graphId: "glife",
    lifecycleState: LifecycleState.FAILED,
    nodes: [{ id: "z", kind: "symbol_placeholder", path: "", language: "n/a" }],
    edges: [],
    generationPolicy: { version: "p/1" },
  });
  assert.strictEqual(validateDependencyGraph(okDoc).ok, true);

  const badLifecycle = buildDependencyGraphDocument({
    graphId: "glife-bad",
    lifecycleState: LifecycleState.REQUESTED,
    nodes: [{ id: "z", kind: "file", path: "z.ts", language: "js" }],
    edges: [],
    generationPolicy: { version: "p/1" },
  });
  badLifecycle.lifecycle_state = "UNKNOWN_STATE_X";
  badLifecycle.updated_at = badLifecycle.updated_at;
  badLifecycle.created_at = badLifecycle.created_at;
  delete badLifecycle.graph_fingerprint_sha256;
  const norm = normalizeGraphStructure({
    schemaVersion: badLifecycle.schema_version,
    graphId: badLifecycle.graph_id,
    lifecycleState: badLifecycle.lifecycle_state,
    nodesIn: badLifecycle.nodes,
    edgesIn: badLifecycle.edges,
    generationPolicy: badLifecycle.generation_policy,
  });
  badLifecycle.graph_fingerprint_sha256 = computeGraphFingerprint(norm);
  const vbad = validateDependencyGraph(badLifecycle);
  assert.strictEqual(vbad.ok, false);
});

test("node kind e edge kind fora da allowlist são rejeitados", () => {
  const docBadNode = buildDependencyGraphDocument({
    graphId: "badnk",
    lifecycleState: LifecycleState.REQUESTED,
    nodes: [{ id: "q", kind: "not_allowed_kind", path: "q.ts", language: "js" }],
    edges: [],
    generationPolicy: { version: "p/1" },
  });
  assert.strictEqual(validateDependencyGraph(docBadNode).ok, false);

  assert.ok(NODE_KIND_VALUES.includes("file"));
  assert.ok(EDGE_KIND_VALUES.includes("placeholder_dependency"));

  const docBadEdge = buildDependencyGraphDocument({
    graphId: "bad-ek",
    lifecycleState: LifecycleState.REQUESTED,
    nodes: [
      { id: "e1", kind: "file", path: "e1.ts", language: "js" },
      { id: "e2", kind: "file", path: "e2.ts", language: "js" },
    ],
    edges: [{ from: "e1", to: "e2", kind: "invalid_kind_edge", reason: "x" }],
    generationPolicy: { version: "p/1" },
  });
  assert.strictEqual(validateDependencyGraph(docBadEdge).ok, false);
});
