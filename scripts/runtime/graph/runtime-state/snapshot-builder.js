"use strict";

const {
  RUNTIME_ARTIFACT_SCHEMA_VERSION,
  RUNTIME_PHASE_TAG,
  RUNTIME_NODE_STATUS,
} = require("./constants");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const { PIPELINE_VARIANT, SCHEMA_VERSION } = require("../constants");

/**
 * Resumo determinístico por estado.
 * @param {object[]} nodesRuntimeState
 * @returns {object}
 */
function buildLifecycleSummary(nodesRuntimeState) {
  const by_status = {};
  for (const n of nodesRuntimeState) {
    const s = n.current_status;
    by_status[s] = (by_status[s] || 0) + 1;
  }
  const keys = Object.keys(by_status).sort();
  const sorted = {};
  for (const k of keys) sorted[k] = by_status[k];
  return {
    total_nodes: nodesRuntimeState.length,
    by_status: sorted,
    pending_count: by_status[RUNTIME_NODE_STATUS.PENDING] || 0,
    terminal_count: nodesRuntimeState.filter((n) =>
      [
        RUNTIME_NODE_STATUS.COMPLETED,
        RUNTIME_NODE_STATUS.FAILED,
        RUNTIME_NODE_STATUS.SKIPPED,
        RUNTIME_NODE_STATUS.BLOCKED,
      ].includes(n.current_status),
    ).length,
  };
}

/**
 * Snapshot inicial: todos pending; pronto para 4.12.3.
 * @param {{
 *   schema_version: number,
 *   pipeline_variant: string,
 *   nodes: object[],
 *   edges: object[],
 *   repeat_edges: object[],
 * }} structuralGraph
 * @param {{
 *   run_id: string,
 *   now_iso: string,
 *   pipeline_status?: string|null,
 *   correction_iterations?: number|null,
 *   source?: string,
 * }} opts
 */
function buildInitialRuntimeSnapshot(structuralGraph, opts) {
  const runId = String(opts.run_id || "");
  const nowIso = opts.now_iso || new Date().toISOString();
  const graphFingerprint = computeExecutionGraphFingerprint(structuralGraph);
  const graph_id = `graph_${graphFingerprint.slice(0, 32)}`;

  const nodes_runtime_state = [...(structuralGraph.nodes || [])]
    .map((sn) => ({
      node_id: sn.node_id,
      kind: sn.kind,
      current_status: RUNTIME_NODE_STATUS.PENDING,
      attempts: 0,
      timestamps: {
        entered_pending_at: nowIso,
      },
      last_transition: null,
      transition_history: [],
      replay_generation: 0,
      blocked_reason: null,
    }))
    .sort((a, b) => a.node_id.localeCompare(b.node_id));

  const embedded_structural_graph = {
    schema_version: structuralGraph.schema_version ?? SCHEMA_VERSION,
    pipeline_variant: structuralGraph.pipeline_variant ?? PIPELINE_VARIANT,
    nodes: [...structuralGraph.nodes].sort((a, b) => a.node_id.localeCompare(b.node_id)),
    edges: [...structuralGraph.edges],
    repeat_edges: [...structuralGraph.repeat_edges],
  };

  const doc = {
    schema_version: RUNTIME_ARTIFACT_SCHEMA_VERSION,
    graph_id,
    graph_fingerprint: graphFingerprint,
    run_id: runId,
    created_at: nowIso,
    updated_at: nowIso,
    runtime_state_version: 1,
    nodes_runtime_state,
    attempts: {
      global: {
        correction_iterations_snapshot:
          opts.correction_iterations != null ? Number(opts.correction_iterations) : null,
        pipeline_status_snapshot: opts.pipeline_status != null ? String(opts.pipeline_status) : null,
      },
      by_node_id: {},
    },
    transitions: [],
    lifecycle_summary: buildLifecycleSummary(nodes_runtime_state),
    replay_metadata: {
      schema: "execution-graph-runtime/v1",
      replay_generation: 0,
      structural_fingerprint_sha256: graphFingerprint,
      invariant: "structural_fingerprint_must_match_embedded_graph",
    },
    metadata: {
      phase: RUNTIME_PHASE_TAG,
      overlay_mode: "shadow",
      source: opts.source || "runtime-state",
      compat: { execution_graph_phase: "4.12.1+4.12.2" },
    },
    compat: {
      phase: RUNTIME_PHASE_TAG,
      pipeline_variant: structuralGraph.pipeline_variant ?? PIPELINE_VARIANT,
    },
    links: {
      execution_graph_json: "execution-graph.json",
      run_log_json: "run-log.json",
      metadata_json: "metadata.json",
      runtime_checkpoints_json: "runtime-checkpoints.json",
    },
    embedded_structural_graph,
  };

  for (const n of nodes_runtime_state) {
    doc.attempts.by_node_id[n.node_id] = { execution_attempts: 0 };
  }

  return doc;
}

module.exports = {
  buildInitialRuntimeSnapshot,
  buildLifecycleSummary,
};
