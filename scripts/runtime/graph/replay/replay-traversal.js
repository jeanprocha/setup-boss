"use strict";

const { REPLAY_NODE_STATUS } = require("./constants");

/**
 * Gerações de replay: distância mínima em arestas outgoing (scheduling) desde qualquer alvo.
 *
 * @param {string[]} targetIds_sorted
 * @param {Map<string, string[]>} outgoingAdj
 * @param {Set<string>} subtree
 */
function assignReplayGenerations(targetIds_sorted, outgoingAdj, subtree) {
  /** @type {Map<string, number>} */
  const dist = new Map();
  /** @type {string[]} */
  const queue = [];

  for (const t of targetIds_sorted) {
    if (!subtree.has(t)) continue;
    dist.set(t, 0);
    queue.push(t);
  }

  let qi = 0;
  while (qi < queue.length) {
    const u = queue[qi++];
    const du = dist.get(u) ?? 0;
    for (const v of outgoingAdj.get(u) || []) {
      if (!subtree.has(v)) continue;
      const alt = du + 1;
      if (!dist.has(v) || alt < dist.get(v)) {
        dist.set(v, alt);
        queue.push(v);
      }
    }
  }

  /** @type {Map<number, string[]>} */
  const layers = new Map();
  for (const id of [...subtree].sort()) {
    if (!dist.has(id)) continue;
    const g = dist.get(id);
    if (!layers.has(g)) layers.set(g, []);
    layers.get(g).push(id);
  }

  const replay_generations = [...layers.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([generation, ids]) => ({
      generation,
      node_ids: ids.sort(),
    }));

  return { generation_by_node: dist, replay_generations };
}

/**
 * Ordem de replay: projectão da ordem determinística global para nós na subárvore.
 * @param {string[]} deterministic_order
 * @param {Set<string>} subtree
 */
function projectReplayOrder(deterministic_order, subtree) {
  return deterministic_order.filter((id) => subtree.has(id));
}

/**
 * Valida que `replay_order` preserva ordem relativa de `deterministic_order`.
 * @param {string[]} replay_order
 * @param {string[]} deterministic_order
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateReplayOrderConsistent(replay_order, deterministic_order) {
  const errors = [];
  const idx = new Map(deterministic_order.map((id, i) => [id, i]));
  let last = -1;
  for (const id of replay_order) {
    const j = idx.get(id);
    if (j === undefined) {
      errors.push(`replay_order contém nó fora do DAG determinístico: ${id}`);
      continue;
    }
    if (j <= last) {
      errors.push(
        `replay_order inconsistente com deterministic_order em ${id} (índice ${j} vs anterior ${last})`,
      );
    }
    last = j;
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Classificação advisory por nó.
 *
 * @param {string} node_id
 * @param {{ subtree: Set<string>, targets: Set<string>, boundaries_hit: Set<string>, blocked: Set<string> }} ctx
 * @param {{ supports_replay: boolean, replay_safe: boolean }} cap
 */
function classifyReplayNodeStatus(node_id, ctx, cap) {
  if (!ctx.subtree.has(node_id)) return REPLAY_NODE_STATUS.REPLAY_OPTIONAL;
  const unsafe = !cap.supports_replay || !cap.replay_safe;
  if (unsafe) return REPLAY_NODE_STATUS.REPLAY_BLOCKED;
  if (ctx.targets.has(node_id)) return REPLAY_NODE_STATUS.REPLAY_REQUIRED;
  if (ctx.boundaries_hit.has(node_id)) return REPLAY_NODE_STATUS.REPLAY_BOUNDARY;
  return REPLAY_NODE_STATUS.REPLAY_SAFE;
}

module.exports = {
  assignReplayGenerations,
  projectReplayOrder,
  validateReplayOrderConsistent,
  classifyReplayNodeStatus,
};
