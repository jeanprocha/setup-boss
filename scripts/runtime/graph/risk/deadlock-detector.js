"use strict";

const { RUNTIME_NODE_STATUS } = require("../runtime-state/constants");
const { buildSchedulingIncomingMap } = require("../scheduler/dependency-resolver");

/**
 * @param {{ nodes?: object[], edges?: object[] }} structuralGraph
 * @param {object|null} schedulerReport
 * @param {object|null} runtimeDoc
 */
function analyzeDeadlock(structuralGraph, schedulerReport, runtimeDoc) {
  const incoming = buildSchedulingIncomingMap(structuralGraph);
  const scheduling_stuck =
    schedulerReport &&
    schedulerReport.blocked_nodes &&
    Array.isArray(schedulerReport.blocked_nodes) &&
    schedulerReport.blocked_nodes.length > 0 &&
    schedulerReport.ok === false;

  const blocked_runtime_nodes = (runtimeDoc && runtimeDoc.nodes_runtime_state
    ? runtimeDoc.nodes_runtime_state
    : []
  )
    .filter((r) => r && r.current_status === RUNTIME_NODE_STATUS.BLOCKED)
    .map((r) => r.node_id)
    .sort();

  /** @type {string[][]} */
  const sample_chains = [];
  for (const start of blocked_runtime_nodes.slice(0, 3)) {
    const chain = traceBlockedChainUpstream(start, incoming, runtimeDoc);
    if (chain.length) sample_chains.push(chain);
  }

  return {
    scheduling_stuck_signal: Boolean(scheduling_stuck),
    blocked_nodes_scheduler: scheduling_stuck ? [...schedulerReport.blocked_nodes].sort() : [],
    blocked_runtime_nodes,
    blocked_upstream_sample_chains: sample_chains,
    notes: scheduling_stuck
      ? "Scheduler advisory reportou nós pendentes sem progresso (possível dependência cíclica ou repeat_edges fora do modelo)."
      : "Sem sinal de scheduling stuck no relatório advisory (quando ausente ou ok).",
  };
}

/**
 * @param {string} nodeId
 * @param {Map<string, Set<string>>} incomingSetMap
 * @param {object|null} runtimeDoc
 * @returns {string[]}
 */
function traceBlockedChainUpstream(nodeId, incomingSetMap, runtimeDoc) {
  const statusById = new Map();
  for (const r of runtimeDoc && runtimeDoc.nodes_runtime_state ? runtimeDoc.nodes_runtime_state : []) {
    if (r && r.node_id) statusById.set(r.node_id, r.current_status);
  }
  const chain = [nodeId];
  const seen = new Set([nodeId]);
  let cur = nodeId;
  for (let depth = 0; depth < 20; depth++) {
    const preds = [...(incomingSetMap.get(cur) || new Set())].sort();
    let next = null;
    for (const p of preds) {
      const st = statusById.get(p);
      if (st === RUNTIME_NODE_STATUS.BLOCKED || st === RUNTIME_NODE_STATUS.PENDING) {
        next = p;
        break;
      }
    }
    if (!next || seen.has(next)) break;
    seen.add(next);
    chain.unshift(next);
    cur = next;
  }
  return chain;
}

module.exports = {
  analyzeDeadlock,
  traceBlockedChainUpstream,
};
