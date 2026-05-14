"use strict";

const {
  SEMANTIC_DEP_GRAPH_SCHEMA_VERSION,
  GRAPH_SNAPSHOT_SCHEMA_VERSION,
  NODE_KIND_SET,
  EDGE_KIND_SET,
  LifecycleState_SET,
} = require("../constants");
const { normalizeGraphStructure, computeGraphFingerprint } = require("../graph-manifest");
const { digestGenerationPolicy, buildSnapshotCanonicalPayload, computeSnapshotFingerprintFromCanonicalPayload } = require("../fingerprint/graph-fingerprint");

const SHA256_HEX = /^[a-f0-9]{64}$/;

/**
 * @param {object} doc
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateDependencyGraph(doc) {
  /** @type {string[]} */
  const errors = [];
  if (!doc || typeof doc !== "object") {
    return { ok: false, errors: ["documento inválido ou ausente"] };
  }

  if (String(doc.schema_version || "") !== SEMANTIC_DEP_GRAPH_SCHEMA_VERSION) {
    errors.push(`schema_version inesperado (esperado ${SEMANTIC_DEP_GRAPH_SCHEMA_VERSION})`);
  }

  if (!doc.graph_id || String(doc.graph_id).trim() === "") {
    errors.push("graph_id obrigatório");
  }

  if (!LifecycleState_SET.has(String(doc.lifecycle_state || ""))) {
    errors.push(`lifecycle_state inválido: "${doc.lifecycle_state}"`);
  }

  const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
  const seenIds = new Set();

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (!n || typeof n !== "object") {
      errors.push(`nodes[${i}] inválido`);
      continue;
    }
    const id = String(n.id != null ? n.id : "").trim();
    if (!id) errors.push(`nodes[${i}].id obrigatório`);
    else if (seenIds.has(id)) errors.push(`id de nó duplicado: ${id}`);
    else seenIds.add(id);

    const kind = String(n.kind || "");
    if (!NODE_KIND_SET.has(kind)) errors.push(`kind de nó inválido em ${id}: ${kind}`);

    if (typeof n.path !== "string") errors.push(`nodes[${id}].path deve ser string`);
    if (typeof n.language !== "string") errors.push(`nodes[${id}].language deve ser string`);
  }

  const edges = Array.isArray(doc.edges) ? doc.edges : [];
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i];
    if (!e || typeof e !== "object") {
      errors.push(`edges[${i}] inválido`);
      continue;
    }
    const from = String(e.from != null ? e.from : "").trim();
    const to = String(e.to != null ? e.to : "").trim();
    if (!from || !seenIds.has(from)) errors.push(`edges[${i}]: 'from' inexistente ou desconhecido (${from})`);
    if (!to || !seenIds.has(to)) errors.push(`edges[${i}]: 'to' inexistente ou desconhecido (${to})`);

    const ek = String(e.kind || "");
    if (!EDGE_KIND_SET.has(ek)) errors.push(`kind de edge inválido em ${from}->${to}: ${ek}`);
    if (!String(e.reason || "").trim()) errors.push(`edges[${i}]: reason obrigatório`);
  }

  if (doc.generation_policy == null || typeof doc.generation_policy !== "object" || Array.isArray(doc.generation_policy)) {
    errors.push("generation_policy deve ser objeto");
  }

  const fpStored = doc.graph_fingerprint_sha256 != null ? String(doc.graph_fingerprint_sha256) : "";
  if (!SHA256_HEX.test(fpStored)) {
    errors.push("graph_fingerprint_sha256 ausente ou formato inválido");
  }

  if (typeof doc.created_at !== "string" || !doc.created_at.trim()) errors.push("created_at obrigatório");
  if (typeof doc.updated_at !== "string" || !doc.updated_at.trim()) errors.push("updated_at obrigatório");

  if (errors.length === 0) {
    const norm = normalizeGraphStructure({
      schemaVersion: doc.schema_version,
      graphId: doc.graph_id,
      lifecycleState: doc.lifecycle_state,
      nodesIn: doc.nodes,
      edgesIn: doc.edges,
      generationPolicy: doc.generation_policy,
    });
    const expected = computeGraphFingerprint(norm);
    if (expected !== fpStored) {
      errors.push(
        `graph_fingerprint_sha256 inconsistente (esperado ${expected}, obtido ${fpStored})`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * @param {object} snap
 * @param {{ generationPolicy?: object }} [ctx]
 */
function validateSnapshotManifest(snap, ctx = {}) {
  /** @type {string[]} */
  const errors = [];
  if (!snap || typeof snap !== "object") {
    return { ok: false, errors: ["snapshot inválido ou ausente"] };
  }

  if (String(snap.schema_version || "") !== GRAPH_SNAPSHOT_SCHEMA_VERSION) {
    errors.push(`schema_version inesperado (esperado ${GRAPH_SNAPSHOT_SCHEMA_VERSION})`);
  }

  if (!String(snap.snapshot_id || "").trim()) errors.push("snapshot_id obrigatório");
  if (!String(snap.graph_id || "").trim()) errors.push("graph_id obrigatório");

  const gfp = String(snap.graph_fingerprint_sha256 || "");
  if (!SHA256_HEX.test(gfp)) errors.push("graph_fingerprint_sha256 inválido");

  const gps = String(snap.generation_policy_sha256 || "");
  if (!SHA256_HEX.test(gps)) errors.push("generation_policy_sha256 inválido");

  if (!String(snap.inputs_digest || "").trim()) errors.push("inputs_digest obrigatório");

  if (typeof snap.created_at !== "string" || !snap.created_at.trim()) errors.push("created_at obrigatório");

  if (ctx.generationPolicy != null && typeof ctx.generationPolicy === "object" && !Array.isArray(ctx.generationPolicy)) {
    const expect = digestGenerationPolicy(ctx.generationPolicy);
    if (expect !== gps) {
      errors.push(
        `generation_policy_sha256 inconsistente com generationPolicy fornecido (esperado ${expect}, obtido ${gps})`,
      );
    }
  }

  if (ctx.graphFingerprintSha256 != null) {
    const exp = String(ctx.graphFingerprintSha256);
    if (exp && exp !== gfp) {
      errors.push(`graph_fingerprint_sha256 diverge do grafo (esperado ${exp}, obtido ${gfp})`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Hash canónico do snapshot (exclui created_at) — útil em testes de estabilidade.
 * @param {object} snap
 */
function snapshotCanonicalFingerprint(snap) {
  const p = buildSnapshotCanonicalPayload({
    schema_version: snap.schema_version,
    snapshot_id: snap.snapshot_id,
    graph_id: snap.graph_id,
    graph_fingerprint_sha256: snap.graph_fingerprint_sha256,
    generation_policy_sha256: snap.generation_policy_sha256,
    inputs_digest: snap.inputs_digest,
  });
  return computeSnapshotFingerprintFromCanonicalPayload(p);
}

module.exports = {
  validateDependencyGraph,
  validateSnapshotManifest,
  snapshotCanonicalFingerprint,
};
