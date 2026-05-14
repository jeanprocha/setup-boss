"use strict";

/**
 * Mapa incoming para invalidação (arestas de scheduling).
 * @param {{ nodes?: object[], edges?: object[] }} graph
 * @returns {Map<string, string[]>}
 */
function buildSchedulingIncomingAdjacency(graph) {
  const ids = new Set((graph.nodes || []).map((n) => n && n.node_id).filter(Boolean));
  /** @type {Map<string, Set<string>>} */
  const inc = new Map();
  for (const id of ids) inc.set(id, new Set());
  for (const e of graph.edges || []) {
    if (!e || typeof e.from !== "string" || typeof e.to !== "string") continue;
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    inc.get(e.to).add(e.from);
  }
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const id of [...ids].sort()) {
    out.set(id, [...inc.get(id)].sort());
  }
  return out;
}

/**
 * Dependentes invalidados = subárvore estrita abaixo dos alvos.
 *
 * @param {Set<string>} subtree
 * @param {Set<string>} targets
 * @returns {string[]}
 */
function computeInvalidatedDependents(subtree, targets) {
  const inv = [];
  for (const id of subtree) {
    if (!targets.has(id)) inv.push(id);
  }
  return inv.sort();
}

/**
 * Para cada dependente invalidado, lista predecessores dentro da subárvore que explicam invalidação.
 *
 * @param {string[]} invalidated_sorted
 * @param {Map<string, string[]>} incomingAdj
 * @param {Set<string>} subtree
 * @returns {{ node_id: string, invalidated_by: string[] }[]}
 */
function buildDependencyInvalidationRecords(invalidated_sorted, incomingAdj, subtree) {
  const records = [];
  for (const node_id of invalidated_sorted) {
    const preds = incomingAdj.get(node_id) || [];
    const invalidated_by = preds.filter((p) => subtree.has(p)).sort();
    records.push({
      node_id,
      invalidated_by,
    });
  }
  return records;
}

module.exports = {
  buildSchedulingIncomingAdjacency,
  computeInvalidatedDependents,
  buildDependencyInvalidationRecords,
};
