"use strict";

const {
  GRAPH_MANIFEST_FILENAME,
  GRAPH_SNAPSHOT_MANIFEST_FILENAME,
} = require("../constants");
const {
  saveDependencyGraph,
  loadDependencyGraph,
  buildDependencyGraphDocument,
} = require("../graph-manifest");
const {
  buildSnapshotManifestDocument,
  saveSnapshotManifest,
  loadSnapshotManifest,
} = require("../snapshot-manifest");

/**
 * Persistência de fixture/manual graph + snapshot determinísticos (sem I/O ao projeto alvo).
 * @param {{
 *   outputDir: string,
 *   graphId: string,
 *   lifecycleState?: string,
 *   nodes: object[],
 *   edges: object[],
 *   generationPolicy?: object,
 *   snapshotId: string,
 *   inputsDigest: string,
 *   timestamps?: { createdAt?: string, updatedAt?: string },
 * }} opts
 */
function persistFixtureSemanticGraphArtifacts(opts) {
  const dir = String(opts.outputDir || "");
  const timestampOpts =
    opts.timestamps != null ? { createdAt: opts.timestamps.createdAt, updatedAt: opts.timestamps.updatedAt } : {};

  const graphDoc = buildDependencyGraphDocument({
    graphId: opts.graphId,
    lifecycleState: opts.lifecycleState,
    nodes: opts.nodes,
    edges: opts.edges,
    generationPolicy: opts.generationPolicy,
    ...timestampOpts,
  });

  saveDependencyGraph(dir, graphDoc);

  const snapDoc = buildSnapshotManifestDocument({
    snapshotId: opts.snapshotId,
    graphId: graphDoc.graph_id,
    graphFingerprintSha256: graphDoc.graph_fingerprint_sha256,
    generationPolicy: graphDoc.generation_policy,
    inputsDigest: opts.inputsDigest,
  });

  saveSnapshotManifest(dir, snapDoc);

  return {
    graphDoc,
    snapshotDoc: snapDoc,
    graphPath: GRAPH_MANIFEST_FILENAME,
    snapshotPath: GRAPH_SNAPSHOT_MANIFEST_FILENAME,
    loadGraph: () => loadDependencyGraph(dir),
    loadSnapshot: () => loadSnapshotManifest(dir),
  };
}

module.exports = {
  persistFixtureSemanticGraphArtifacts,
};
