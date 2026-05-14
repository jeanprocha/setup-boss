"use strict";

const { validateExecutionGraphDoc, findSourceOrphans } = require("../graph-validation");
const { validateKnownNodeReferencesOnEdges } = require("../scheduler/dependency-resolver");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const { NODE_ID } = require("../constants");

/**
 * @param {object} structuralGraph
 * @param {object|null} executionGraphDoc
 * @param {object|null} runtimeDoc
 */
function analyzeIntegrity(structuralGraph, executionGraphDoc, runtimeDoc) {
  const ref = validateKnownNodeReferencesOnEdges(structuralGraph);
  const orphans = findSourceOrphans(structuralGraph);
  const unexpected_source_orphans = orphans.filter((id) => id !== NODE_ID.SCAN).sort();

  const ids = (structuralGraph.nodes || []).map((n) => n.node_id);
  const reachEdges = (structuralGraph.edges || [])
    .filter((e) => e && e.from && e.to)
    .map((e) => ({ from: e.from, to: e.to }));
  const unreachable = findUnreachableFromRootsBfs([NODE_ID.SCAN], ids, reachEdges);

  let execution_graph_doc_ok = null;
  let execution_graph_doc_errors = [];
  if (executionGraphDoc) {
    const v = validateExecutionGraphDoc(executionGraphDoc);
    execution_graph_doc_ok = v.ok;
    execution_graph_doc_errors = v.errors || [];
  }

  let fingerprint_alignment = "unknown";
  const fpCanon = computeExecutionGraphFingerprint(structuralGraph);
  if (runtimeDoc && runtimeDoc.graph_fingerprint) {
    fingerprint_alignment = runtimeDoc.graph_fingerprint === fpCanon ? "aligned" : "mismatch";
  }
  if (executionGraphDoc && executionGraphDoc.graph_fingerprint) {
    if (executionGraphDoc.graph_fingerprint !== fpCanon) fingerprint_alignment = "mismatch_execution_graph";
  }

  return {
    edge_reference_ok: ref.ok,
    edge_reference_errors: ref.errors || [],
    source_orphans: orphans,
    unexpected_source_orphans,
    unreachable_from_scan_scheduling: unreachable,
    execution_graph_doc_ok,
    execution_graph_doc_errors,
    fingerprint_alignment,
    canonical_fingerprint_sha256: fpCanon,
  };
}

/**
 * BFS reachability (arestas scheduling: mesmo conjunto que `edges` canónicas).
 */
function findUnreachableFromRootsBfs(roots, nodeIds, edgePairs) {
  const idSet = new Set(nodeIds);
  const adj = new Map();
  for (const id of idSet) adj.set(id, []);
  for (const e of edgePairs) {
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue;
    adj.get(e.from).push(e.to);
  }
  const seen = new Set();
  const q = [...roots].filter((r) => idSet.has(r)).sort();
  for (const r of q) seen.add(r);
  let qi = 0;
  while (qi < q.length) {
    const u = q[qi++];
    for (const v of [...(adj.get(u) || [])].sort()) {
      if (!seen.has(v)) {
        seen.add(v);
        q.push(v);
      }
    }
  }
  return [...idSet].filter((id) => !seen.has(id)).sort();
}

module.exports = {
  analyzeIntegrity,
  findUnreachableFromRootsBfs,
};
