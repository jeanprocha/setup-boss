"use strict";

const { EDGE_KIND, NODE_STATUS } = require("./constants");

/**
 * DFS — detecta ciclo em subgrafo dirigido por lista de arestas {from,to}
 * @param {string[]} nodeIds
 * @param {{ from: string, to: string }[]} edges
 * @returns {boolean}
 */
function hasCycle(nodeIds, edges) {
  const adj = new Map();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue;
    adj.get(e.from).push(e.to);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const mark = new Map();
  for (const id of nodeIds) mark.set(id, WHITE);

  function visit(u) {
    mark.set(u, GRAY);
    for (const v of adj.get(u) || []) {
      const s = mark.get(v);
      if (s === GRAY) return true;
      if (s === WHITE && visit(v)) return true;
    }
    mark.set(u, BLACK);
    return false;
  }

  for (const id of [...nodeIds].sort()) {
    if (mark.get(id) === WHITE && visit(id)) return true;
  }
  return false;
}

/**
 * Ciclo apenas em arestas `hard` (espinha DAG).
 * @param {{ nodes?: object[], edges?: object[] }} graph
 * @returns {boolean}
 */
function hasHardEdgeCycle(graph) {
  const nodes = graph.nodes || [];
  const edges = (graph.edges || []).filter((e) => e && e.kind === EDGE_KIND.HARD);
  const ids = nodes.map((n) => n.node_id);
  return hasCycle(ids, edges);
}

/**
 * Nós sem qualquer aresta de entrada (from→to) no conjunto completo edges+repeat_edges.
 * @param {{ nodes?: object[], edges?: object[], repeat_edges?: object[] }} graph
 * @returns {string[]}
 */
function findSourceOrphans(graph) {
  const nodes = graph.nodes || [];
  const targets = new Set();
  for (const e of [...(graph.edges || []), ...(graph.repeat_edges || [])]) {
    if (e && e.to) targets.add(e.to);
  }
  const orphans = nodes
    .map((n) => n.node_id)
    .filter((id) => !targets.has(id))
    .sort();
  return orphans;
}

/**
 * Nós não alcançáveis desde roots seguindo arestas `hard` (para diagnóstico).
 * @param {string[]} roots
 * @param {{ nodes?: object[], edges?: object[] }} graph
 */
function findUnreachableFromRoots(roots, graph) {
  const nodes = graph.nodes || [];
  const ids = new Set(nodes.map((n) => n.node_id));
  const hard = (graph.edges || []).filter((e) => e && e.kind === EDGE_KIND.HARD);
  const adj = new Map();
  for (const id of ids) adj.set(id, []);
  for (const e of hard) {
    if (adj.has(e.from) && adj.has(e.to)) adj.get(e.from).push(e.to);
  }
  const seen = new Set();
  const stack = [...roots].filter((r) => ids.has(r)).sort();
  while (stack.length) {
    const u = stack.pop();
    if (seen.has(u)) continue;
    seen.add(u);
    for (const v of [...adj.get(u)].sort()) stack.push(v);
  }
  return [...ids].filter((id) => !seen.has(id)).sort();
}

/**
 * Validação mínima do documento persistido (4.12.1).
 * @param {object} doc
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateExecutionGraphDoc(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") {
    return { ok: false, errors: ["documento inválido"] };
  }
  if (typeof doc.schema_version !== "number") errors.push("schema_version obrigatório");
  if (!Array.isArray(doc.nodes)) errors.push("nodes deve ser array");
  if (!Array.isArray(doc.edges)) errors.push("edges deve ser array");
  const allowed = new Set(Object.values(NODE_STATUS));

  const nodeIds = new Set();
  for (const n of doc.nodes || []) {
    if (!n || typeof n.node_id !== "string") {
      errors.push("node sem node_id");
      continue;
    }
    if (nodeIds.has(n.node_id)) errors.push(`node_id duplicado: ${n.node_id}`);
    nodeIds.add(n.node_id);
    if (!allowed.has(n.status)) errors.push(`status inválido em ${n.node_id}`);
  }
  for (const e of doc.edges || []) {
    if (!e || typeof e.from !== "string" || typeof e.to !== "string") {
      errors.push("edge inválida");
      continue;
    }
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) errors.push(`edge órfã: ${e.from}->${e.to}`);
  }
  for (const e of doc.repeat_edges || []) {
    if (!e || typeof e.from !== "string" || typeof e.to !== "string") {
      errors.push("repeat_edge inválida");
      continue;
    }
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to))
      errors.push(`repeat_edge órfã: ${e.from}->${e.to}`);
  }

  if (doc.nodes && hasHardEdgeCycle({ nodes: doc.nodes, edges: doc.edges })) {
    errors.push("ciclo em arestas hard");
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  hasCycle,
  hasHardEdgeCycle,
  findSourceOrphans,
  findUnreachableFromRoots,
  validateExecutionGraphDoc,
};
