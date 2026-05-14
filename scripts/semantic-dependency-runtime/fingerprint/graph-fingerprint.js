"use strict";

const crypto = require("crypto");
const { stableStringify } = require("../lib/stable-stringify");

/**
 * Payload canónico do grafo (exclui lifecycle_state, graph_fingerprint_sha256, timestamps).
 * @param {object} normalized
 */
function buildGraphCanonicalFingerprintPayload(normalized) {
  return {
    schema_version: normalized.schema_version,
    graph_id: normalized.graph_id,
    nodes: normalized.nodes_canonical,
    edges: normalized.edges_canonical,
    generation_policy: normalized.generation_policy_sorted,
  };
}

function sha256HexUtf8(str) {
  return crypto.createHash("sha256").update(String(str), "utf8").digest("hex");
}

function computeGraphFingerprintFromCanonicalPayload(payload) {
  return sha256HexUtf8(stableStringify(payload));
}

/**
 * Snapshot: conteúdo replay-safe sem created_at.
 */
function buildSnapshotCanonicalPayload(parts) {
  return {
    schema_version: parts.schema_version,
    snapshot_id: parts.snapshot_id,
    graph_id: parts.graph_id,
    graph_fingerprint_sha256: parts.graph_fingerprint_sha256,
    generation_policy_sha256: parts.generation_policy_sha256,
    inputs_digest: parts.inputs_digest,
  };
}

function computeSnapshotFingerprintFromCanonicalPayload(payload) {
  return sha256HexUtf8(stableStringify(payload));
}

function digestGenerationPolicy(generationPolicy) {
  return sha256HexUtf8(stableStringify(generationPolicy));
}

module.exports = {
  buildGraphCanonicalFingerprintPayload,
  computeGraphFingerprintFromCanonicalPayload,
  buildSnapshotCanonicalPayload,
  computeSnapshotFingerprintFromCanonicalPayload,
  digestGenerationPolicy,
  sha256HexUtf8,
};
