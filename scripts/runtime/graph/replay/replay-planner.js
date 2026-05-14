"use strict";

const { NODE_ID } = require("../constants");
const { REPLAY_NODE_STATUS } = require("./constants");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const { computeDeterministicSchedulingOrder } = require("../scheduler/dependency-resolver");
const { buildSchedulingOutgoingAdjacency, collectDownstreamSubtree } = require("./subtree-resolver");
const {
  buildSchedulingIncomingAdjacency,
  computeInvalidatedDependents,
  buildDependencyInvalidationRecords,
} = require("./invalidation-engine");
const {
  assignReplayGenerations,
  projectReplayOrder,
  classifyReplayNodeStatus,
} = require("./replay-traversal");
const { runReplayValidators } = require("./replay-validators");

/**
 * @param {import('../node-adapters/adapter-base').RuntimeNodeAdapter[]} adapters
 * @returns {Map<string, { supports_replay: boolean, replay_safe: boolean, deterministic: boolean, produces_side_effects: boolean, resumable: boolean, replay_sensitivity: string }>}
 */
function buildCapabilityLookup(adapters) {
  /** @type {Map<string, any>} */
  const m = new Map();
  for (const a of adapters) {
    const d = a.descriptor;
    m.set(d.node_id, {
      supports_replay: Boolean(d.supports_replay),
      replay_safe: Boolean(d.capabilities && d.capabilities.replay_safe),
      deterministic: Boolean(d.capabilities && d.capabilities.deterministic),
      produces_side_effects: Boolean(d.capabilities && d.capabilities.produces_side_effects),
      resumable: Boolean(d.capabilities && d.capabilities.resumable),
      replay_sensitivity: String(d.replay_sensitivity || ""),
    });
  }
  return m;
}

/**
 * Planeamento advisory de replay — não executa pipeline nem handlers.
 *
 * @param {{
 *   structuralGraph: object,
 *   runtimeSnapshot: object|null,
 *   adapters: import('../node-adapters/adapter-base').RuntimeNodeAdapter[],
 *   target_node_ids: string[],
 *   boundary_stop_node_ids?: string[],
 * }} opts
 */
function planGraphReplay(opts) {
  const structuralGraph = opts.structuralGraph;
  const runtimeSnapshot = opts.runtimeSnapshot;
  const adapters = opts.adapters || [];
  const target_node_ids = [...new Set(opts.target_node_ids || [])].sort();
  const boundary_stop_node_ids = opts.boundary_stop_node_ids || [];
  const boundary_stop = new Set(boundary_stop_node_ids);

  const outgoingAdj = buildSchedulingOutgoingAdjacency(structuralGraph);
  const incomingAdj = buildSchedulingIncomingAdjacency(structuralGraph);
  const deterministic_order = computeDeterministicSchedulingOrder(structuralGraph);

  const graphIds = new Set((structuralGraph.nodes || []).map((n) => n.node_id));
  const valid_targets_sorted = target_node_ids.filter((t) => graphIds.has(t)).sort();

  const { subtree, boundaries_hit, cycle_detected } = collectDownstreamSubtree(
    valid_targets_sorted,
    outgoingAdj,
    boundary_stop,
  );

  const targets = new Set(target_node_ids);
  const invalidated_sorted = computeInvalidatedDependents(subtree, targets);
  const dependency_invalidation = buildDependencyInvalidationRecords(
    invalidated_sorted,
    incomingAdj,
    subtree,
  );

  const replay_order = projectReplayOrder(deterministic_order, subtree);
  const { replay_generations } = assignReplayGenerations(
    valid_targets_sorted,
    outgoingAdj,
    subtree,
  );

  const capLookup = buildCapabilityLookup(adapters);
  const replay_capability_matrix = {};
  /** @type {Record<string, string>} */
  const replay_status_by_node = {};
  /** @type {string[]} */
  const replay_blocked_nodes = [];
  /** @type {string[]} */
  const replay_safe_nodes = [];

  const graphNodeIds = [...(structuralGraph.nodes || []).map((n) => n.node_id)].sort();
  for (const node_id of graphNodeIds) {
    const cap = capLookup.get(node_id) || {
      supports_replay: false,
      replay_safe: false,
      deterministic: false,
      produces_side_effects: true,
      resumable: false,
      replay_sensitivity: "unknown",
    };

    replay_capability_matrix[node_id] = {
      supports_replay: cap.supports_replay,
      replay_safe: cap.replay_safe,
      deterministic: cap.deterministic,
      produces_side_effects: cap.produces_side_effects,
      resumable: cap.resumable,
      replay_sensitivity: cap.replay_sensitivity,
      advisory_only_simulated: true,
      deterministic_replay_eligible: Boolean(cap.deterministic && cap.replay_safe && cap.supports_replay),
    };

    const st = classifyReplayNodeStatus(node_id, { subtree, targets, boundaries_hit }, cap);
    replay_status_by_node[node_id] = st;

    if (subtree.has(node_id)) {
      if (st === REPLAY_NODE_STATUS.REPLAY_BLOCKED) replay_blocked_nodes.push(node_id);
      else replay_safe_nodes.push(node_id);
    }
  }

  const validatorParts = {
    subtree,
    invalidated_nodes: invalidated_sorted,
    replay_order,
    deterministic_order,
    cycle_detected,
    replay_blocked_nodes,
  };

  const validation = runReplayValidators(structuralGraph, runtimeSnapshot, target_node_ids, validatorParts);

  const subtree_sorted = [...subtree].sort();
  const replay_boundaries_sorted = [...boundaries_hit].sort();

  const targetsReachable =
    target_node_ids.length > 0 &&
    target_node_ids.every((t) => graphIds.has(t)) &&
    valid_targets_sorted.length === target_node_ids.length &&
    valid_targets_sorted.every((t) => subtree.has(t));

  return {
    ok: validation.validation_ok && targetsReachable,
    graph_fingerprint: computeExecutionGraphFingerprint(structuralGraph),
    graph_id: `graph_${computeExecutionGraphFingerprint(structuralGraph).slice(0, 32)}`,
    target_nodes: target_node_ids,
    replay_subtree: subtree_sorted,
    invalidated_nodes: invalidated_sorted,
    replay_order,
    replay_generations,
    replay_safe_nodes: replay_safe_nodes.sort(),
    replay_blocked_nodes: replay_blocked_nodes.sort(),
    replay_boundaries: replay_boundaries_sorted,
    replay_capability_matrix,
    replay_status_by_node,
    dependency_invalidation,
    diagnostics: validation.diagnostics,
    warnings: validation.warnings,
    replay_blockers: validation.diagnostics.map((d) => ({
      code: d.code,
      detail: d.detail,
      node_id: d.node_id,
    })),
    deterministic_order,
    skipped_repeat_edges: [...(structuralGraph.repeat_edges || [])],
    repeat_edges_policy: "not_traversed_automatically",
    advisory_only: true,
    real_pipeline_handlers_invoked: false,
  };
}

/**
 * Alvos por ambiente (shadow): lista separada por vírgulas; default `n-executor`.
 */
function parseReplayTargetsFromEnv() {
  const raw = process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY_TARGETS;
  if (raw == null || String(raw).trim() === "") {
    return [NODE_ID.EXECUTOR];
  }
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

function parseReplayBoundaryStopsFromEnv() {
  const raw = process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY_BOUNDARY_STOPS;
  if (raw == null || String(raw).trim() === "") return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

module.exports = {
  planGraphReplay,
  buildCapabilityLookup,
  parseReplayTargetsFromEnv,
  parseReplayBoundaryStopsFromEnv,
};
