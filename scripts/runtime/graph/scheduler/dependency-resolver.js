"use strict";

const { hasCycle, hasHardEdgeCycle } = require("../graph-validation");
const { EDGE_KIND } = require("../constants");

/**
 * Arestas que entram no grafo de scheduling MVP: `edges` (hard + conditional).
 * `repeat_edges` são ignoradas — não entram em dependências nem em ordem topológica.
 *
 * @param {{ nodes?: object[], edges?: object[], repeat_edges?: object[] }} graph
 * @returns {{ from: string, to: string, kind?: string }[]}
 */
function getSchedulingEdges(graph) {
  const out = [];
  for (const e of graph.edges || []) {
    if (!e || typeof e.from !== "string" || typeof e.to !== "string") continue;
    out.push({ from: e.from, to: e.to, kind: e.kind });
  }
  return out;
}

/**
 * Mapa to → Set(from) para dependências de scheduling (sem repeat_edges).
 * @param {{ nodes?: object[], edges?: object[] }} graph
 * @returns {Map<string, Set<string>>}
 */
function buildSchedulingIncomingMap(graph) {
  const ids = new Set((graph.nodes || []).map((n) => n && n.node_id).filter(Boolean));
  const incoming = new Map();
  for (const id of ids) incoming.set(id, new Set());
  for (const e of graph.edges || []) {
    if (!e || !ids.has(e.from) || !ids.has(e.to)) continue;
    incoming.get(e.to).add(e.from);
  }
  return incoming;
}

/**
 * Referências em arestas devem existir em `nodes`.
 * @param {{ nodes?: object[], edges?: object[], repeat_edges?: object[] }} graph
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateKnownNodeReferencesOnEdges(graph) {
  const errors = [];
  const ids = new Set((graph.nodes || []).map((n) => n.node_id));
  for (const e of graph.edges || []) {
    if (!e) continue;
    if (!ids.has(e.from)) errors.push(`edge unknown from: ${e.from}`);
    if (!ids.has(e.to)) errors.push(`edge unknown to: ${e.to}`);
  }
  for (const e of graph.repeat_edges || []) {
    if (!e) continue;
    if (!ids.has(e.from)) errors.push(`repeat_edge unknown from: ${e.from}`);
    if (!ids.has(e.to)) errors.push(`repeat_edge unknown to: ${e.to}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Sem ciclos nas arestas hard (espinha DAG).
 * @param {{ nodes?: object[], edges?: object[] }} graph
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateHardEdgesAcyclic(graph) {
  if (hasHardEdgeCycle(graph)) {
    return { ok: false, errors: ["ciclo detectado em arestas hard"] };
  }
  return { ok: true, errors: [] };
}

/**
 * Sem ciclos nas arestas de scheduling (edges canónicas, sem repeat_edges).
 * @param {{ nodes?: object[], edges?: object[] }} graph
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateSchedulingEdgesAcyclic(graph) {
  const nodes = graph.nodes || [];
  const ids = nodes.map((n) => n.node_id);
  const pairs = getSchedulingEdges(graph).map((e) => ({ from: e.from, to: e.to }));
  if (hasCycle(ids, pairs)) {
    return { ok: false, errors: ["ciclo detectado em arestas de scheduling (edges)"] };
  }
  return { ok: true, errors: [] };
}

/**
 * Ordem topológica determinística (Kahn + fila prontos ordenada lexicalmente).
 * Usa apenas `graph.edges` (hard + conditional), nunca `repeat_edges`.
 *
 * @param {{ nodes?: object[], edges?: object[] }} graph
 */
function computeDeterministicSchedulingOrder(graph) {
  const nodes = graph.nodes || [];
  const ids = nodes.map((n) => n.node_id).sort();
  const edges = (graph.edges || []).filter(
    (e) => e && e.kind !== EDGE_KIND.REPEAT,
  );
  const hard = edges;

  const incoming = new Map();
  const outgoing = new Map();
  for (const id of ids) {
    incoming.set(id, new Set());
    outgoing.set(id, new Set());
  }
  for (const e of hard) {
    if (!incoming.has(e.to) || !outgoing.has(e.from)) continue;
    incoming.get(e.to).add(e.from);
    outgoing.get(e.from).add(e.to);
  }

  const ready = ids.filter((id) => incoming.get(id).size === 0).sort();
  const out = [];
  while (ready.length) {
    const n = ready.shift();
    out.push(n);
    const outs = [...outgoing.get(n)].sort();
    for (const m of outs) {
      incoming.get(m).delete(n);
      if (incoming.get(m).size === 0) {
        ready.push(m);
        ready.sort();
      }
    }
  }
  if (out.length !== ids.length) {
    throw new Error(
      "computeDeterministicSchedulingOrder: ciclo ou grafo incompleto (arestas edges).",
    );
  }
  return out;
}

module.exports = {
  getSchedulingEdges,
  buildSchedulingIncomingMap,
  validateKnownNodeReferencesOnEdges,
  validateHardEdgesAcyclic,
  validateSchedulingEdgesAcyclic,
  computeDeterministicSchedulingOrder,
};
