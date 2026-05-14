"use strict";

const { EDGE_KIND } = require("../constants");

/**
 * Adjacência outgoing só com `graph.edges` (hard + conditional). `repeat_edges` ignoradas.
 * @param {{ nodes?: object[], edges?: object[] }} graph
 * @returns {Map<string, string[]>} node_id → filhos ordenados lexicamente
 */
function buildSchedulingOutgoingAdjacency(graph) {
  const ids = new Set((graph.nodes || []).map((n) => n && n.node_id).filter(Boolean));
  /** @type {Map<string, Set<string>>} */
  const out = new Map();
  for (const id of ids) out.set(id, new Set());
  for (const e of graph.edges || []) {
    if (!e || typeof e.from !== "string" || typeof e.to !== "string") continue;
    if (e.kind === EDGE_KIND.REPEAT) continue;
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    out.get(e.from).add(e.to);
  }
  /** @type {Map<string, string[]>} */
  const adj = new Map();
  for (const id of [...ids].sort()) {
    adj.set(id, [...out.get(id)].sort());
  }
  return adj;
}

/**
 * Conjunto fechado downstream determinístico; opcional paragem em `boundary_stop_ids`.
 * Detecta ciclos na travessia (não esperados num DAG íntegro).
 *
 * @param {string[]} targetIds — únicos
 * @param {Map<string, string[]>} outgoingAdj
 * @param {Set<string>} boundary_stop_ids
 * @returns {{ subtree: Set<string>, boundaries_hit: Set<string>, visited_edges: string[], cycle_detected: boolean }}
 */
function collectDownstreamSubtree(targetIds, outgoingAdj, boundary_stop_ids) {
  const subtree = new Set();
  const boundaries_hit = new Set();
  /** @type {Set<string>} */
  const stack = new Set();
  /** @type {Set<string>} */
  const closed = new Set();
  let cycle_detected = false;
  const visited_edges = [];

  function dfs(id) {
    if (stack.has(id)) {
      cycle_detected = true;
      return;
    }
    if (closed.has(id)) return;
    stack.add(id);
    subtree.add(id);

    const stopHere = boundary_stop_ids && boundary_stop_ids.has(id);
    if (stopHere) {
      boundaries_hit.add(id);
      stack.delete(id);
      closed.add(id);
      return;
    }

    const kids = outgoingAdj.get(id) || [];
    for (const k of kids) {
      visited_edges.push(`${id}->${k}`);
      dfs(k);
    }

    stack.delete(id);
    closed.add(id);
  }

  for (const t of targetIds) {
    dfs(t);
  }

  return { subtree, boundaries_hit, visited_edges, cycle_detected };
}

module.exports = {
  buildSchedulingOutgoingAdjacency,
  collectDownstreamSubtree,
};
