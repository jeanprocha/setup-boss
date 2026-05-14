"use strict";

const fs = require("fs");
const path = require("path");
const {
  SEMANTIC_DEP_GRAPH_SCHEMA_VERSION,
  GRAPH_MANIFEST_FILENAME,
  LifecycleState,
} = require("./constants");
const { normalizePathPOSIX } = require("./lib/path-normalize");
const {
  buildGraphCanonicalFingerprintPayload,
  computeGraphFingerprintFromCanonicalPayload,
} = require("./fingerprint/graph-fingerprint");

function clonePlainMetadata(meta) {
  if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const keys = Object.keys(meta);
  if (!keys.length) return undefined;
  return JSON.parse(JSON.stringify(meta));
}

/** @param {object} n */
function canonicalNodeShape(n) {
  const o = {
    id: n.id,
    kind: n.kind,
    path: n.path,
    language: n.language,
  };
  const m = clonePlainMetadata(n.metadata);
  if (m) o.metadata = m;
  return o;
}

/** @param {object} e */
function canonicalEdgeShape(e) {
  const o = {
    from: e.from,
    to: e.to,
    kind: e.kind,
    reason: e.reason,
  };
  const m = clonePlainMetadata(e.metadata);
  if (m) o.metadata = m;
  return o;
}

/**
 * @param {unknown[]} nodesIn
 * @param {unknown[]} edgesIn
 */
function normalizeGraphStructure({ schemaVersion, graphId, lifecycleState, nodesIn, edgesIn, generationPolicy }) {
  const schema_version = schemaVersion || SEMANTIC_DEP_GRAPH_SCHEMA_VERSION;
  const graph_id = String(graphId || "").trim();
  const lifecycle_state =
    lifecycleState != null && String(lifecycleState).trim() !== ""
      ? String(lifecycleState).trim()
      : LifecycleState.REQUESTED;

  const rawNodes = Array.isArray(nodesIn) ? nodesIn : [];
  /** @type {{ id: string, kind: string, path: string, language: string, metadata?: object }[]} */
  const nodes = [];
  for (let i = 0; i < rawNodes.length; i += 1) {
    const n = rawNodes[i];
    if (!n || typeof n !== "object") continue;
    nodes.push({
      id: String(n.id != null ? n.id : "").trim(),
      kind: String(n.kind != null ? n.kind : "").trim(),
      path: normalizePathPOSIX(n.path != null ? n.path : ""),
      language: String(n.language != null ? n.language : "").trim(),
      ...(n.metadata != null && typeof n.metadata === "object" && !Array.isArray(n.metadata)
        ? { metadata: JSON.parse(JSON.stringify(n.metadata)) }
        : {}),
    });
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  const rawEdges = Array.isArray(edgesIn) ? edgesIn : [];
  /** @type {{ from: string, to: string, kind: string, reason: string, metadata?: object }[]} */
  const edges = [];
  for (let i = 0; i < rawEdges.length; i += 1) {
    const e = rawEdges[i];
    if (!e || typeof e !== "object") continue;
    const row = {
      from: String(e.from != null ? e.from : "").trim(),
      to: String(e.to != null ? e.to : "").trim(),
      kind: String(e.kind != null ? e.kind : "").trim(),
      reason: String(e.reason != null ? e.reason : "").trim(),
      ...(e.metadata != null && typeof e.metadata === "object" && !Array.isArray(e.metadata)
        ? { metadata: JSON.parse(JSON.stringify(e.metadata)) }
        : {}),
    };
    edges.push(row);
  }
  edges.sort((a, b) => {
    const sf = a.from.localeCompare(b.from);
    if (sf !== 0) return sf;
    const st = a.to.localeCompare(b.to);
    if (st !== 0) return st;
    const sk = a.kind.localeCompare(b.kind);
    if (sk !== 0) return sk;
    return a.reason.localeCompare(b.reason);
  });

  const generation_policy =
    generationPolicy != null && typeof generationPolicy === "object" && !Array.isArray(generationPolicy)
      ? JSON.parse(JSON.stringify(generationPolicy))
      : { version: "semantic-dep-policy/0" };

  const nodes_canonical = nodes.map((x) => canonicalNodeShape(x));
  const edges_canonical = edges.map((x) => canonicalEdgeShape(x));

  /** @typedef {{schema_version:string, graph_id:string, lifecycle_state:string, nodes:typeof nodes, edges:typeof edges, nodes_canonical:object[], edges_canonical:object[], generation_policy:object}} Norm */
  return /** @type {Norm} */ ({
    schema_version,
    graph_id,
    lifecycle_state,
    nodes,
    edges,
    nodes_canonical,
    edges_canonical,
    generation_policy,
    generation_policy_sorted: generation_policy,
  });
}

function computeGraphFingerprint(normalizedBundle) {
  const payload = buildGraphCanonicalFingerprintPayload({
    schema_version: normalizedBundle.schema_version,
    graph_id: normalizedBundle.graph_id,
    nodes_canonical: normalizedBundle.nodes_canonical,
    edges_canonical: normalizedBundle.edges_canonical,
    generation_policy_sorted: normalizedBundle.generation_policy,
  });
  return computeGraphFingerprintFromCanonicalPayload(payload);
}

/**
 * Documento persistível dependency-graph.json
 * @param {{ graphId:string, lifecycleState?:string, nodes:unknown[], edges:unknown[], generationPolicy?:object, createdAt?:string, updatedAt?:string, schemaVersion?:string }} opts
 */
function buildDependencyGraphDocument(opts) {
  const now = new Date().toISOString();
  const created_at = opts.createdAt != null ? String(opts.createdAt) : now;
  const updated_at = opts.updatedAt != null ? String(opts.updatedAt) : now;

  const norm = normalizeGraphStructure({
    schemaVersion: opts.schemaVersion,
    graphId: opts.graphId,
    lifecycleState: opts.lifecycleState,
    nodesIn: opts.nodes,
    edgesIn: opts.edges,
    generationPolicy: opts.generationPolicy,
  });

  const graph_fingerprint_sha256 = computeGraphFingerprint(norm);

  return {
    schema_version: norm.schema_version,
    graph_id: norm.graph_id,
    lifecycle_state: norm.lifecycle_state,
    nodes: norm.nodes_canonical,
    edges: norm.edges_canonical,
    generation_policy: norm.generation_policy,
    graph_fingerprint_sha256,
    created_at,
    updated_at,
  };
}

function saveDependencyGraph(outputDir, doc) {
  const dir = String(outputDir || "");
  const full = path.join(dir, GRAPH_MANIFEST_FILENAME);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(doc, null, 2), "utf8");
}

function loadDependencyGraph(outputDir) {
  const full = path.join(String(outputDir || ""), GRAPH_MANIFEST_FILENAME);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

module.exports = {
  normalizeGraphStructure,
  computeGraphFingerprint,
  buildDependencyGraphDocument,
  saveDependencyGraph,
  loadDependencyGraph,
};
