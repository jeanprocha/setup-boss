"use strict";

const { RUNTIME_NODE_STATUS } = require("../runtime-state/constants");
const { buildSchedulingIncomingMap } = require("./dependency-resolver");

function findRuntimeRow(doc, nodeId) {
  return (doc.nodes_runtime_state || []).find((r) => r.node_id === nodeId) || null;
}

/**
 * Nós `pending` cujos pais (via `graph.edges` apenas) estão todos `completed`.
 *
 * @param {{ nodes?: object[], edges?: object[] }} graph
 * @param {object} runtimeDoc
 * @param {Map<string, number>} orderIndex  node_id → índice em ordem canónica
 * @returns {string[]} node_ids prontos, ordenados pela ordem determinística
 */
function resolveReadyPendingNodeIds(graph, runtimeDoc, orderIndex) {
  const incoming = buildSchedulingIncomingMap(graph);
  const pending = (runtimeDoc.nodes_runtime_state || []).filter(
    (r) => r.current_status === RUNTIME_NODE_STATUS.PENDING,
  );
  const ready = [];
  for (const row of pending) {
    const parents = incoming.get(row.node_id) || new Set();
    let ok = true;
    for (const p of parents) {
      const pr = findRuntimeRow(runtimeDoc, p);
      if (!pr || pr.current_status !== RUNTIME_NODE_STATUS.COMPLETED) {
        ok = false;
        break;
      }
    }
    if (ok) ready.push(row.node_id);
  }
  ready.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
  return ready;
}

module.exports = {
  resolveReadyPendingNodeIds,
  findRuntimeRow,
};
