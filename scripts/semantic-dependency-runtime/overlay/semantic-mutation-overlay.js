"use strict";

/**
 * Semantic Mutation Overlay v1 — subgrafo impactado a partir de dependency-graph.json
 * e artefactos de execução (sem validation/governance/scoring AST).
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { normalizePath } = require("../../execution-plan/normalization/operation-normalizer");
const pathNorm = require("../lib/path-normalize");
const { stableStringify } = require("../lib/stable-stringify");
const {
  SEMANTIC_MUTATION_GRAPH_SCHEMA_VERSION,
  PROPAGATION_MANIFEST_SCHEMA_VERSION,
  SEMANTIC_MUTATION_GRAPH_FILENAME,
  PROPAGATION_MANIFEST_FILENAME,
  MutationReasonCodes,
  OVERLAY_LIMITS_DEFAULTS,
} = require("./constants");

function posixKey(p) {
  return pathNorm.normalizePathPOSIX(p);
}

function sha256Utf8Hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function sortUnique(arr) {
  return [...new Set(arr.map(String))].sort((a, b) => a.localeCompare(b));
}

/** @typedef {{ path: string, reason_codes: string[], sources?: string[] }} MutationRootRecord */

function collectMutationRootsUnified(input) {
  /** @type {Map<string, { reason_codes: Set<string>; sources: Set<string> }>} */
  const m = new Map();

  function touch(pathStr, reasons, sources) {
    const key = posixKey(pathStr);
    if (!key) return;
    let slot = m.get(key);
    if (!slot) {
      slot = { reason_codes: new Set(), sources: new Set() };
      m.set(key, slot);
    }
    reasons.forEach((r) => slot.reason_codes.add(r));
    (sources || []).forEach((s) => slot.sources.add(s));
  }

  const ex = Array.isArray(input.executorChanges) ? input.executorChanges : [];
  for (const row of ex) {
    if (!row || typeof row !== "object") continue;
    const np = normalizePath(row.path != null ? row.path : "");
    if (!np) continue;
    touch(np, [MutationReasonCodes.DIRECT_CHANGE], ["executor_changes"]);
  }

  const recon = input.reconciliation && typeof input.reconciliation === "object" ? input.reconciliation : null;
  if (recon) {
    for (const row of recon.unexpected_changes || []) {
      if (!row || typeof row !== "object") continue;
      const np = posixKey(row.path != null ? row.path : "");
      if (!np) continue;
      touch(np, [MutationReasonCodes.RECONCILIATION_UNEXPECTED], ["execution_reconciliation.unexpected_changes"]);
    }
    for (const row of recon.unmatched_operations || []) {
      if (!row || typeof row !== "object") continue;
      const np = posixKey(row.path != null ? row.path : "");
      if (!np) continue;
      touch(np, [MutationReasonCodes.RECONCILIATION_UNMATCHED], ["execution_reconciliation.unmatched_operations"]);
    }
  }

  for (const rp of Array.isArray(input.explicitRoots) ? input.explicitRoots : []) {
    touch(rp, [MutationReasonCodes.EXPLICIT_ROOT], ["explicit_roots"]);
  }

  return m;
}

/** @returns {MutationRootRecord[]} */
function rootsUnifiedToSortedRecords(rootMap) {
  /** @type {MutationRootRecord[]} */
  const out = [];
  for (const pathKey of [...rootMap.keys()].sort((a, b) => a.localeCompare(b))) {
    const slot = rootMap.get(pathKey);
    if (!slot) continue;
    out.push({
      path: pathKey,
      reason_codes: sortUnique([...slot.reason_codes]),
      sources: sortUnique([...slot.sources]),
    });
  }
  return out;
}

/**
 * Índices (apenas vértices ficheiro mapeiam roots por path POSIX).
 */
function indexDependencyStructure(dependencyGraphDoc) {
  const nodesArr = Array.isArray(dependencyGraphDoc.nodes) ? dependencyGraphDoc.nodes : [];
  const edgesArr = Array.isArray(dependencyGraphDoc.edges) ? dependencyGraphDoc.edges : [];

  /** @type {Map<string, object>} */
  const nodeById = new Map();
  /** @type {Map<string, string[]>} */
  const idsByPath = new Map();

  for (const n of nodesArr) {
    if (!n || typeof n !== "object") continue;
    const nid = String(n.id || "").trim();
    if (!nid) continue;
    nodeById.set(nid, n);
    const p = posixKey(n.path != null ? n.path : "");
    if (!p || String(n.kind || "") === "symbol_placeholder") continue;
    const list = idsByPath.get(p) || [];
    list.push(nid);
    idsByPath.set(p, list);
  }
  for (const k of [...idsByPath.keys()]) {
    idsByPath.set(k, [...new Set(idsByPath.get(k) || [])].sort((a, b) => a.localeCompare(b)));
  }

  /** @typedef {{ neighbor: string; kind: string; reason: string }} Neighbor */

  /** @type {Map<string, Neighbor[]>} */
  const forwardNeighbors = new Map();
  /** @type {Map<string, Neighbor[]>} */
  const reverseNeighbors = new Map();

  for (const e of edgesArr) {
    if (!e || typeof e !== "object") continue;
    const fromId = String(e.from || "").trim();
    const toId = String(e.to || "").trim();
    const kind = String(e.kind || "");
    const ereason = String(e.reason || "");
    if (!fromId || !toId || fromId === toId) continue;

    const fwd = forwardNeighbors.get(fromId) || [];
    fwd.push({ neighbor: toId, kind, reason: ereason });
    forwardNeighbors.set(fromId, fwd);

    const rev = reverseNeighbors.get(toId) || [];
    rev.push({ neighbor: fromId, kind, reason: ereason });
    reverseNeighbors.set(toId, rev);
  }

  for (const nid of [...forwardNeighbors.keys()]) {
    forwardNeighbors.set(
      nid,
      (forwardNeighbors.get(nid) || []).sort((a, b) =>
        `${a.neighbor}\u001e${a.kind}\u001e${a.reason}`.localeCompare(
          `${b.neighbor}\u001e${b.kind}\u001e${b.reason}`,
        ),
      ),
    );
  }
  for (const nid of [...reverseNeighbors.keys()]) {
    reverseNeighbors.set(
      nid,
      (reverseNeighbors.get(nid) || []).sort((a, b) =>
        `${a.neighbor}\u001e${a.kind}\u001e${a.reason}`.localeCompare(
          `${b.neighbor}\u001e${b.kind}\u001e${b.reason}`,
        ),
      ),
    );
  }

  return { nodeById, idsByPath, forwardNeighbors, reverseNeighbors };
}

function tryImproveReach(bestAt, nodeId, candDist, candRootPath) {
  const next = { distance: candDist, originating_root_path: candRootPath };
  const prev = bestAt.get(nodeId);
  if (!prev) {
    bestAt.set(nodeId, next);
    return true;
  }
  if (
    candDist < prev.distance ||
    (candDist === prev.distance && candRootPath.localeCompare(prev.originating_root_path) < 0)
  ) {
    bestAt.set(nodeId, next);
    return true;
  }
  return false;
}

/** @typedef {{ neighbor: string; kind: string; reason: string }} Neighbor */

/**
 * BFS ordenada minimal (distance, originating_root_path, vertex id).
 */
function propagateDirectedStable({
  /** @type {Map<string, Neighbor[]>} */
  adjNeighbors,
  /** @type {{ node_id: string; root_path: string }[]} */
  seeds,
  reachReasonCode,
  /** @type {{ max_hops: number; max_nodes: number; max_edges: number }} */
  limits,
}) {
  /** @type {Map<string, { distance: number; originating_root_path: string }>} */
  const bestAt = new Map();
  /** @type {{ node_id: string; distance: number; root_path: string }[]} */
  const queue = [];

  seeds
    .slice()
    .sort((a, b) =>
      `${a.root_path}\u001e${a.node_id}`.localeCompare(`${b.root_path}\u001e${b.node_id}`),
    )
    .forEach((s) => {
      tryImproveReach(bestAt, s.node_id, 0, s.root_path);
      queue.push({ node_id: s.node_id, distance: 0, root_path: s.root_path });
    });

  const limits_applied = {
    max_hops_truncated_neighbor_skips: 0,
    max_nodes_hit: false,
    max_edges_hit: false,
  };

  /** @type {{from:string,to:string,kind:string,reason_codes:string[]}[]} */
  const edgesOut = [];

  function staleQueueEntry(item) {
    const inc = bestAt.get(item.node_id);
    return !inc || inc.distance !== item.distance || inc.originating_root_path !== item.root_path;
  }

  /** @typedef {{ node_id:string, distance:number, root_path:string }} Q */

  let guard = 0;
  while (queue.length > 0 && guard < limits.max_edges * limits.max_nodes + 32768) {
    guard += 1;
    queue.sort((a, b) =>
      a.distance !== b.distance
        ? a.distance - b.distance
        : `${a.root_path}\u001e${a.node_id}`.localeCompare(`${b.root_path}\u001e${b.node_id}`),
    );
    const cur = /** @type {Q}*/ (queue.shift());
    if (!cur) break;
    if (staleQueueEntry(cur)) continue;

    const outs = adjNeighbors.get(cur.node_id) || [];

    const canExpandFrontier = cur.distance < limits.max_hops;

    for (let i = 0; i < outs.length; i += 1) {
      if (edgesOut.length >= limits.max_edges) {
        limits_applied.max_edges_hit = true;
        queue.length = 0;
        break;
      }

      const st = outs[i];
      const tgt = st.neighbor;
      const tgtNew = !bestAt.has(tgt);
      const allowNewAlloc = tgtNew ? bestAt.size < limits.max_nodes : true;

      if (!allowNewAlloc) {
        limits_applied.max_nodes_hit = true;
        continue;
      }

      edgesOut.push({
        from: cur.node_id,
        to: tgt,
        kind: st.kind,
        reason_codes: sortUnique([reachReasonCode]),
      });

      const nextDist = cur.distance + 1;
      if (!canExpandFrontier) {
        limits_applied.max_hops_truncated_neighbor_skips += 1;
        continue;
      }
      if (nextDist > limits.max_hops) {
        limits_applied.max_hops_truncated_neighbor_skips += 1;
        continue;
      }

      const improved = tryImproveReach(bestAt, tgt, nextDist, cur.root_path);
      if (improved) {
        queue.push({ node_id: tgt, distance: nextDist, root_path: cur.root_path });
      }
    }

    if (limits_applied.max_edges_hit) break;
  }

  edgesOut.sort((a, b) =>
    `${a.from}\u001e${a.to}\u001e${a.kind}`.localeCompare(`${b.from}\u001e${b.to}\u001e${b.kind}`),
  );

  return { bestAt, edgesOut, limits_applied };
}

function dedupeMergedEdges(rows) {
  /** @type {Map<string, {from:string,to:string,kind:string,reason_codes:Set<string>} >} */
  const acc = new Map();
  for (const r of rows) {
    const k = `${r.from}\u001e${r.to}\u001e${r.kind}`;
    let slot = acc.get(k);
    if (!slot) {
      slot = { from: r.from, to: r.to, kind: r.kind, reason_codes: new Set() };
      acc.set(k, slot);
    }
    for (const rc of r.reason_codes || []) slot.reason_codes.add(String(rc));
  }
  /** @type {typeof rows } */
  const out = [...acc.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((k) => {
      const s = acc.get(k);
      return {
        from: s.from,
        to: s.to,
        kind: s.kind,
        reason_codes: sortUnique([...s.reason_codes]),
      };
    });
  return out;
}

function cmpReachTuple(A, B) {
  const d = A.distance - B.distance;
  if (d !== 0) return d;
  return A.originating_root_path.localeCompare(B.originating_root_path);
}

function minimalReachTuple(fw, rv) {
  if (fw && !rv) return fw;
  if (!fw && rv) return rv;
  if (!fw && !rv) return null;
  return cmpReachTuple(fw, rv) <= 0 ? fw : rv;
}

function defaultOverlayId(graphId, graphFpRef, limitsSnap, rootsPathsSorted, seedSignatures) {
  const raw = stableStringify({
    graph_id: graphId,
    graph_fingerprint_ref: graphFpRef,
    limits: limitsSnap,
    roots: rootsPathsSorted,
    seeds_digest: stableStringify(seedSignatures),
    schema: SEMANTIC_MUTATION_GRAPH_SCHEMA_VERSION,
  });
  return `smo-${sha256Utf8Hex(raw).slice(0, 24)}`;
}

/**
 * @param {{
 * dependencyGraphDoc: object,
 * executorChanges?: unknown[],
 * reconciliation?: object|null,
 * explicitRoots?: string[],
 * overlayId?: string,
 * limits?: Partial<typeof OVERLAY_LIMITS_DEFAULTS>,
 * createdAt?: string,
 * }} opts
 */
function buildSemanticMutationOverlayDocument(opts) {
  const dep = opts.dependencyGraphDoc;
  const graph_id = dep && dep.graph_id != null ? String(dep.graph_id) : "";
  const graph_fp_ref =
    dep &&
    typeof dep.graph_fingerprint_sha256 === "string" &&
    String(dep.graph_fingerprint_sha256).trim()
      ? String(dep.graph_fingerprint_sha256).trim()
      : "__unset__";

  const limitsMerged = /** @type {typeof OVERLAY_LIMITS_DEFAULTS} */ ({
    ...OVERLAY_LIMITS_DEFAULTS,
    ...(opts.limits && typeof opts.limits === "object" ? opts.limits : {}),
  });

  const traversalLimits = {
    max_hops: limitsMerged.max_hops,
    max_nodes: limitsMerged.max_nodes,
    max_edges: limitsMerged.max_edges,
  };

  const rootsMap = collectMutationRootsUnified(opts);
  const rootsRecords = rootsUnifiedToSortedRecords(rootsMap);
  const { nodeById, idsByPath, forwardNeighbors, reverseNeighbors } =
    indexDependencyStructure(dep);

  /** @type {{ path: string; reason_codes: string[]; missing_from_graph?: boolean }[]} */
  const rootsSerialized = [];

  /** @type {{node_id:string, root_path:string}[]} */
  const seedPairs = [];
  /** @type {Map<string, Set<string>>} */
  const rootPathsPerSeedNode = new Map();

  const rootsSortedPaths = rootsRecords.map((/** @type {any}*/ r) => r.path).sort();

  /** @type {Map<string, Set<string>>} */
  const rootRcByPath = new Map();
  for (let r = 0; r < rootsRecords.length; r += 1) {
    rootRcByPath.set(rootsRecords[r].path, new Set(rootsRecords[r].reason_codes));
  }

  for (let i = 0; i < rootsRecords.length; i += 1) {
    const rr = rootsRecords[i];
    const ids = idsByPath.get(rr.path) || [];
    rootsSerialized.push({
      path: rr.path,
      reason_codes: rr.reason_codes.slice().sort((a, b) => a.localeCompare(b)),
      ...(ids.length === 0 ? { missing_from_graph: true } : {}),
    });

    ids.forEach((nid) => {
      seedPairs.push({ node_id: nid, root_path: rr.path });
      if (!rootPathsPerSeedNode.has(nid)) rootPathsPerSeedNode.set(nid, new Set());
      rootPathsPerSeedNode.get(nid).add(rr.path);
    });
  }

  seedPairs.sort((a, b) =>
    `${a.root_path}\u001e${a.node_id}`.localeCompare(`${b.root_path}\u001e${b.node_id}`),
  );

  const fwd = propagateDirectedStable({
    adjNeighbors: forwardNeighbors,
    seeds: seedPairs.slice(),
    reachReasonCode: MutationReasonCodes.IMPORT_REACH,
    limits: traversalLimits,
  });

  /** @type {{from:string,to:string,kind:string,reason_codes:string[]}[]} */
  const mergedEdges = fwd.edgesOut.slice();

  /** @type {ReturnType<typeof propagateDirectedStable> | null} */
  let rev = null;

  let limitsFwd = fwd.limits_applied;

  /** @type {null | Record<string, unknown>} */
  let limitsRev = null;

  if (limitsMerged.enable_reverse_reach) {
    rev = propagateDirectedStable({
      adjNeighbors: reverseNeighbors,
      seeds: seedPairs.slice(),
      reachReasonCode: MutationReasonCodes.REVERSE_IMPORT_REACH,
      limits: traversalLimits,
    });
    mergedEdges.push(...rev.edgesOut);
    limitsRev = rev.limits_applied;
  }

  const impacted_edges = dedupeMergedEdges(mergedEdges);

  /** @typedef {{ distance: number; originating_root_path: string }} ReachState */

  function aggregateSeedReasonsForNode(seedId) {
    const pathsArr = [...(rootPathsPerSeedNode.get(seedId) || [])].sort((a, b) => a.localeCompare(b));
    const merged = new Set();
    pathsArr.forEach((pItem) => {
      const sx = rootRcByPath.get(pItem);
      if (sx)
        [...sx].forEach((rx) => {
          merged.add(rx);
        });
    });
    return sortUnique([...merged]);
  }

  /** @type {Map<string,string>} */
  const pathByNodeId = new Map();
  nodeById.forEach((nodeVal, nk) => {
    const pp = posixKey(nodeVal && nodeVal.path != null ? nodeVal.path : "");
    pathByNodeId.set(nk, pp ? pp : nk);
  });

  /** @type {Set<string>} */
  const allIds = new Set();
  fwd.bestAt.forEach((_, k) => allIds.add(k));
  if (rev) rev.bestAt.forEach((_, k2) => allIds.add(k2));
  rootPathsPerSeedNode.forEach((_, nk) => allIds.add(nk));

  const impacted_node_ids = sortUnique([...allIds]);

  /** @typedef {{node_id:string,path:string,reason_codes:string[],distance_from_root:number|null,discovered_from:string}} ImpNode */

  /** @type {ImpNode[]} */
  const impacted_nodes_out = impacted_node_ids.map((nid) => {
    /** @type {ReachState|null|undefined} */
    const fw = fwd.bestAt.get(nid);
    /** @type {ReachState|null|undefined} */
    const rv = rev ? rev.bestAt.get(nid) : undefined;
    const chosen = minimalReachTuple(fw || null, rv || null);

    /** @type {Set<string>} */
    const rs = new Set(aggregateSeedReasonsForNode(nid));
    if (fw && fw.distance > 0) rs.add(MutationReasonCodes.IMPORT_REACH);
    if (rv && rv.distance > 0) rs.add(MutationReasonCodes.REVERSE_IMPORT_REACH);

    const smallestSeedPaths = [...(rootPathsPerSeedNode.get(nid) || [])].sort((a, b) => a.localeCompare(b))[0];

    /** @type {number|null} */
    let distance_from_root =
      chosen != null
        ? chosen.distance
        : smallestSeedPaths != null
          ? 0
          : null;

    const discovered_from =
      chosen != null
        ? chosen.originating_root_path
        : smallestSeedPaths != null
          ? smallestSeedPaths
          : "";

    return {
      node_id: nid,
      path: pathByNodeId.get(nid) || "",
      reason_codes: sortUnique([...rs]),
      distance_from_root,
      discovered_from,
    };
  });

  impacted_nodes_out.sort((a, b) => a.node_id.localeCompare(b.node_id));


  const propagation_summary = {
    mutation_roots_paths_total: rootsRecords.length,
    mutation_roots_missing_in_graph_count: rootsSerialized.filter((r) => r.missing_from_graph).length,
    seed_unique_graph_vertices: rootPathsPerSeedNode.size,
    impacted_nodes_count: impacted_nodes_out.length,
    impacted_edges_count: impacted_edges.length,
    forward_unique_nodes_visited: fwd.bestAt.size,
    reverse_unique_nodes_visited: rev ? rev.bestAt.size : 0,
    forward_edges_emitted: fwd.edgesOut.length,
    reverse_edges_emitted: rev ? rev.edgesOut.length : 0,
    seeds_edges_pairs_total: seedPairs.length,
  };

  const limits_snapshot = {
    max_hops: limitsMerged.max_hops,
    max_nodes: limitsMerged.max_nodes,
    max_edges: limitsMerged.max_edges,
    enable_reverse_reach: limitsMerged.enable_reverse_reach !== false,
  };

  const overlay_id =
    opts.overlayId != null && String(opts.overlayId).trim() !== ""
      ? String(opts.overlayId).trim()
      : defaultOverlayId(graph_id, graph_fp_ref, limits_snapshot, rootsSortedPaths, seedPairs);

  const limits_execution = Object.assign({}, { forward: limitsFwd }, rev ? { reverse: limitsRev } : {});

  const propagation_fingerprint_sha256 = sha256Utf8Hex(
    stableStringify({
      schema_version: SEMANTIC_MUTATION_GRAPH_SCHEMA_VERSION,
      overlay_id,
      graph_id,
      graph_fingerprint_ref: graph_fp_ref,
      roots: rootsSerialized,
      impacted_nodes: impacted_nodes_out,
      impacted_edges,
      propagation_summary,
      limits_snapshot,
      limits_execution,
    }),
  );

  const created_at = opts.createdAt != null ? String(opts.createdAt) : new Date().toISOString();

  return {
    schema_version: SEMANTIC_MUTATION_GRAPH_SCHEMA_VERSION,
    overlay_id,
    graph_id,
    graph_fingerprint_ref: graph_fp_ref,
    roots: rootsSerialized,
    impacted_nodes: impacted_nodes_out,
    impacted_edges,
    propagation_summary,
    propagation_fingerprint_sha256,
    limits_snapshot,
    limits_execution,
    created_at,
  };
}

function buildPropagationProjectionManifest(semanticMutationDoc) {
  const pathsSorted = sortUnique(
    (semanticMutationDoc.impacted_nodes || [])
      .map((n) => String(n.path || "").trim())
      .filter(Boolean),
  );

  const modules = new Set();
  pathsSorted.forEach((rowP) => {
    const dirnameVal = typeof rowP === "string" ? path.posix.dirname(rowP) : ".";
    if (dirnameVal && dirnameVal !== ".") modules.add(dirnameVal);
  });

  const modulesSorted = [...modules].sort((a, b) => a.localeCompare(b));

  return {
    schema_version: PROPAGATION_MANIFEST_SCHEMA_VERSION,
    propagation_manifest_id: semanticMutationDoc.overlay_id,
    propagation_fingerprint_sha256: semanticMutationDoc.propagation_fingerprint_sha256,
    graph_id: semanticMutationDoc.graph_id,
    overlay_id: semanticMutationDoc.overlay_id,
    impacted_paths: pathsSorted,
    impacted_modules: modulesSorted,
    propagation_stats: {
      impacted_nodes_total: semanticMutationDoc.propagation_summary.impacted_nodes_count,
      impacted_edges_total: semanticMutationDoc.propagation_summary.impacted_edges_count,
      impacted_paths_unique: pathsSorted.length,
      impacted_modules_unique: modulesSorted.length,
      roots_missing_in_graph: semanticMutationDoc.propagation_summary.mutation_roots_missing_in_graph_count,
    },
    roots_summary: semanticMutationDoc.roots.length
      ? semanticMutationDoc.roots.slice().sort((a, b) => String(a.path).localeCompare(String(b.path)))
      : [],
    created_at: semanticMutationDoc.created_at,
  };
}

function saveSemanticMutationGraph(outputDir, doc) {
  const fp = path.join(String(outputDir || ""), SEMANTIC_MUTATION_GRAPH_FILENAME);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(doc, null, 2), "utf8");
}

function savePropagationManifest(outputDir, manifestDoc) {
  const fp = path.join(String(outputDir || ""), PROPAGATION_MANIFEST_FILENAME);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(manifestDoc, null, 2), "utf8");
}

function persistSemanticMutationArtifacts(outputDir, overlayDoc, projectionDoc) {
  saveSemanticMutationGraph(outputDir, overlayDoc);
  savePropagationManifest(outputDir, projectionDoc);
}

function loadSemanticMutationGraph(outputDir) {
  const fp = path.join(String(outputDir || ""), SEMANTIC_MUTATION_GRAPH_FILENAME);
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch (_) {
    return null;
  }
}

function loadPropagationManifest(outputDir) {
  const fp = path.join(String(outputDir || ""), PROPAGATION_MANIFEST_FILENAME);
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch (_) {
    return null;
  }
}

module.exports = {
  buildSemanticMutationOverlayDocument,
  buildPropagationProjectionManifest,
  saveSemanticMutationGraph,
  savePropagationManifest,
  persistSemanticMutationArtifacts,
  loadSemanticMutationGraph,
  loadPropagationManifest,
  MutationReasonCodes,
  SEMANTIC_MUTATION_GRAPH_FILENAME,
  PROPAGATION_MANIFEST_FILENAME,
  OVERLAY_LIMITS_DEFAULTS,
};


