"use strict";

const crypto = require("crypto");
const { SCHEMA_VERSION, PIPELINE_VARIANT } = require("./constants");
const { stableStringify } = require("./stable-json");

/**
 * Payload usado para hash — sem timestamps, sem run_id, sem status de nós.
 * @param {{
 *   schema_version: number,
 *   pipeline_variant: string,
 *   nodes: object[],
 *   edges: object[],
 *   repeat_edges: object[],
 * }} graph
 */
function buildFingerprintPayload(graph) {
  const nodes = [...(graph.nodes || [])]
    .map((n) => ({
      node_id: n.node_id,
      kind: n.kind,
      iteration: n.iteration ?? 0,
      artifacts_expected: [...(n.artifacts_expected || [])].sort(),
    }))
    .sort((a, b) => String(a.node_id).localeCompare(String(b.node_id)));

  const edges = [...(graph.edges || [])]
    .map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      condition: e.condition != null ? String(e.condition) : null,
    }))
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) ||
        a.kind.localeCompare(b.kind) ||
        String(a.condition || "").localeCompare(String(b.condition || "")),
    );

  const repeat_edges = [...(graph.repeat_edges || [])]
    .map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      condition: e.condition != null ? String(e.condition) : null,
    }))
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) ||
        a.kind.localeCompare(b.kind),
    );

  return {
    schema_version: graph.schema_version ?? SCHEMA_VERSION,
    pipeline_variant: graph.pipeline_variant ?? PIPELINE_VARIANT,
    nodes,
    edges,
    repeat_edges,
  };
}

/**
 * @param {{
 *   schema_version: number,
 *   pipeline_variant: string,
 *   nodes: object[],
 *   edges: object[],
 *   repeat_edges: object[],
 * }} graph
 * @returns {string} hex sha256
 */
function computeExecutionGraphFingerprint(graph) {
  const payload = buildFingerprintPayload(graph);
  return crypto.createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
}

module.exports = {
  buildFingerprintPayload,
  computeExecutionGraphFingerprint,
};
