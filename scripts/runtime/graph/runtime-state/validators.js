"use strict";

const { computeExecutionGraphFingerprint, buildFingerprintPayload } = require("../fingerprint");
const { RUNTIME_NODE_STATUS, TERMINAL_RUNTIME_STATUSES } = require("./constants");
const { validateTransitionPair } = require("./transitions");

/**
 * Alinhamento nós / fingerprint vs grafo estrutural canónico.
 * @param {object} runtimeDoc
 * @param {object} structuralGraph
 * @param {string} [expectedFingerprintHex]
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateRuntimeStructuralAlignment(runtimeDoc, structuralGraph, expectedFingerprintHex) {
  const errors = [];
  const structIds = new Set((structuralGraph.nodes || []).map((n) => n.node_id));
  const runIds = new Set((runtimeDoc.nodes_runtime_state || []).map((n) => n.node_id));

  if (structIds.size !== runIds.size) {
    errors.push(`contagem de nós: estrutural=${structIds.size} runtime=${runIds.size}`);
  }
  for (const id of [...structIds].sort()) {
    if (!runIds.has(id)) errors.push(`nó em falta no runtime: ${id}`);
  }
  for (const id of [...runIds].sort()) {
    if (!structIds.has(id)) errors.push(`nó extra no runtime (sem modelo): ${id}`);
  }

  const computed = computeExecutionGraphFingerprint(structuralGraph);
  if (expectedFingerprintHex && computed !== expectedFingerprintHex) {
    errors.push("fingerprint esperado ≠ fingerprint computado (grafo)");
  }
  if (runtimeDoc.graph_fingerprint && runtimeDoc.graph_fingerprint !== computed) {
    errors.push("graph_fingerprint do doc ≠ fingerprint computado do grafo (mismatch)");
  }

  for (const rn of runtimeDoc.nodes_runtime_state || []) {
    const sn = (structuralGraph.nodes || []).find((x) => x.node_id === rn.node_id);
    if (sn && sn.kind !== rn.kind) {
      errors.push(`kind mismatch ${rn.node_id}: ${rn.kind} vs ${sn.kind}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Log global `transitions`: seq estritamente crescente a partir de 1.
 * @param {object[]} transitions
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateTransitionsLogMonotonic(transitions) {
  const errors = [];
  if (!Array.isArray(transitions)) return { ok: false, errors: ["transitions não é array"] };
  let last = 0;
  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    const seq = t && t.seq;
    if (typeof seq !== "number" || !Number.isInteger(seq)) {
      errors.push(`transitions[${i}]: seq inválido`);
      continue;
    }
    if (seq <= last) errors.push(`transitions fora de ordem: seq ${seq} após ${last}`);
    last = seq;
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Detecta inconsistências óbvias pós-transition.
 * @param {object} nodeRow
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateNodeStateConsistency(nodeRow) {
  const errors = [];
  const st = nodeRow.current_status;
  if (st === RUNTIME_NODE_STATUS.COMPLETED && nodeRow.last_transition) {
    const to = nodeRow.last_transition.to;
    if (to !== RUNTIME_NODE_STATUS.COMPLETED) {
      errors.push(`${nodeRow.node_id}: completed com last_transition.to != completed`);
    }
  }
  if (TERMINAL_RUNTIME_STATUSES.has(st) && nodeRow.transition_history) {
    const h = nodeRow.transition_history;
    if (Array.isArray(h) && h.length > 0) {
      const last = h[h.length - 1];
      if (last && last.to !== st) {
        errors.push(`${nodeRow.node_id}: current_status ${st} ≠ última transição.to ${last.to}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Valida pares antes de aplicar.
 * @param {{ from: string, to: string }[]} pairs
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateTransitionSequence(pairs) {
  const errors = [];
  for (let i = 0; i < pairs.length; i++) {
    const r = validateTransitionPair(pairs[i].from, pairs[i].to);
    if (!r.ok) errors.push(`[${i}] ${r.message || r.code}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Histórico por nó: seq estritamente crescente.
 * @param {object[]} history
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateNodeTransitionHistoryOrder(history) {
  const errors = [];
  if (!Array.isArray(history)) return { ok: false, errors: ["history não é array"] };
  let last = 0;
  for (let i = 0; i < history.length; i++) {
    const seq = history[i] && history[i].seq;
    if (typeof seq !== "number") {
      errors.push(`history[${i}] sem seq`);
      continue;
    }
    if (seq <= last) errors.push(`histórico fora de ordem: seq ${seq}`);
    last = seq;
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Comparar grafo embutido (opcional) com fingerprint principal.
 * @param {object} runtimeDoc
 * @param {string} mainFingerprint
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateEmbeddedGraphFingerprint(runtimeDoc, mainFingerprint) {
  const g = runtimeDoc.embedded_structural_graph;
  if (!g) return { ok: true, errors: [] };
  const fp = computeExecutionGraphFingerprint(g);
  if (fp !== mainFingerprint) {
    return {
      ok: false,
      errors: ["embedded_structural_graph fingerprint ≠ graph_fingerprint principal"],
    };
  }
  return { ok: true, errors: [] };
}

/**
 * Payload canónico embutido (debug / replay-safe); sem timestamps.
 * @param {object} g
 */
function structuralPayloadForEmbed(g) {
  return buildFingerprintPayload({
    schema_version: g.schema_version,
    pipeline_variant: g.pipeline_variant,
    nodes: g.nodes,
    edges: g.edges,
    repeat_edges: g.repeat_edges,
  });
}

module.exports = {
  validateRuntimeStructuralAlignment,
  validateTransitionsLogMonotonic,
  validateNodeStateConsistency,
  validateTransitionSequence,
  validateNodeTransitionHistoryOrder,
  validateEmbeddedGraphFingerprint,
  structuralPayloadForEmbed,
};
