"use strict";

const { RUNTIME_NODE_STATUS } = require("./constants");
const { validateTransitionPair } = require("./transitions");
const { buildLifecycleSummary } = require("./snapshot-builder");
const {
  validateNodeTransitionHistoryOrder,
  validateTransitionsLogMonotonic,
} = require("./validators");

let __globalSeq = 0;

function nextGlobalTransitionSeq() {
  __globalSeq += 1;
  return __globalSeq;
}

function resetGlobalTransitionSeqForTests(n = 0) {
  __globalSeq = n;
}

/**
 * Aplica uma transição validada ao documento runtime (mutação).
 * @param {object} doc
 * @param {{
 *   node_id: string,
 *   to: string,
 *   at: string,
 *   blocked_reason?: string|null,
 *   meta?: object,
 * }} spec
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
function applyRuntimeTransition(doc, spec) {
  const nodeId = spec && spec.node_id;
  const to = spec && spec.to;
  const at = spec && spec.at;
  if (!nodeId || !to || !at) {
    return { ok: false, code: "INVALID_SPEC", message: "node_id, to, at obrigatórios" };
  }

  const row = (doc.nodes_runtime_state || []).find((n) => n.node_id === nodeId);
  if (!row) {
    return { ok: false, code: "UNKNOWN_NODE", message: `nó inexistente: ${nodeId}` };
  }

  const from = row.current_status;
  const vr = validateTransitionPair(from, to);
  if (!vr.ok) return vr;

  if (to === RUNTIME_NODE_STATUS.RUNNING) {
    row.attempts = (row.attempts || 0) + 1;
    if (doc.attempts && doc.attempts.by_node_id && doc.attempts.by_node_id[nodeId]) {
      doc.attempts.by_node_id[nodeId].execution_attempts =
        (doc.attempts.by_node_id[nodeId].execution_attempts || 0) + 1;
    }
  }

  if (to === RUNTIME_NODE_STATUS.BLOCKED && spec.blocked_reason != null) {
    row.blocked_reason = String(spec.blocked_reason);
  } else if (to !== RUNTIME_NODE_STATUS.BLOCKED) {
    row.blocked_reason = null;
  }

  row.current_status = to;
  row.timestamps = row.timestamps || {};
  const tsKey = `entered_${to}_at`;
  row.timestamps[tsKey] = at;
  row.updated_at = at;

  const localSeq =
    (Array.isArray(row.transition_history) ? row.transition_history.length : 0) + 1;
  const rec = {
    seq: localSeq,
    from,
    to,
    at,
    ...(spec.meta && typeof spec.meta === "object" ? { meta: spec.meta } : {}),
  };
  row.transition_history = [...(row.transition_history || []), rec];
  row.last_transition = { from, to, at, seq: localSeq };

  const gseq = nextGlobalTransitionSeq();
  doc.transitions = [...(doc.transitions || [])];
  doc.transitions.push({
    seq: gseq,
    node_id: nodeId,
    from,
    to,
    at,
    ...(spec.blocked_reason != null && to === RUNTIME_NODE_STATUS.BLOCKED
      ? { blocked_reason: String(spec.blocked_reason) }
      : {}),
  });

  doc.runtime_state_version = (doc.runtime_state_version || 0) + 1;
  doc.updated_at = at;
  doc.lifecycle_summary = buildLifecycleSummary(doc.nodes_runtime_state);

  const m1 = validateTransitionsLogMonotonic(doc.transitions);
  if (!m1.ok) return { ok: false, code: "GLOBAL_LOG_ORDER", message: m1.errors.join("; ") };

  const m2 = validateNodeTransitionHistoryOrder(row.transition_history);
  if (!m2.ok) return { ok: false, code: "NODE_HISTORY_ORDER", message: m2.errors.join("; ") };

  return { ok: true };
}

module.exports = {
  applyRuntimeTransition,
  resetGlobalTransitionSeqForTests,
};
