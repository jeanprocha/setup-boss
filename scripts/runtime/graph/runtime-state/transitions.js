"use strict";

const { RUNTIME_NODE_STATUS, ALL_RUNTIME_STATUSES } = require("./constants");

/**
 * Máquina de estados determinística (4.12.2).
 * Terminais: completed, failed, skipped, blocked (sem saída nesta fase).
 */
const ALLOWED_TRANSITIONS = {
  [RUNTIME_NODE_STATUS.PENDING]: new Set([
    RUNTIME_NODE_STATUS.READY,
    RUNTIME_NODE_STATUS.BLOCKED,
    RUNTIME_NODE_STATUS.SKIPPED,
  ]),
  [RUNTIME_NODE_STATUS.READY]: new Set([
    RUNTIME_NODE_STATUS.RUNNING,
    RUNTIME_NODE_STATUS.BLOCKED,
    RUNTIME_NODE_STATUS.SKIPPED,
  ]),
  [RUNTIME_NODE_STATUS.RUNNING]: new Set([
    RUNTIME_NODE_STATUS.COMPLETED,
    RUNTIME_NODE_STATUS.FAILED,
    RUNTIME_NODE_STATUS.BLOCKED,
  ]),
  [RUNTIME_NODE_STATUS.COMPLETED]: new Set(),
  [RUNTIME_NODE_STATUS.FAILED]: new Set(),
  [RUNTIME_NODE_STATUS.SKIPPED]: new Set(),
  [RUNTIME_NODE_STATUS.BLOCKED]: new Set(),
};

/**
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function isTransitionAllowed(from, to) {
  if (from === to) return false;
  const set = ALLOWED_TRANSITIONS[from];
  if (!set) return false;
  return set.has(to);
}

/**
 * @param {string} from
 * @param {string} to
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
function validateTransitionPair(from, to) {
  if (typeof from !== "string" || typeof to !== "string") {
    return { ok: false, code: "INVALID_ARGS", message: "from/to devem ser string" };
  }
  if (!ALL_RUNTIME_STATUSES.has(from) || !ALL_RUNTIME_STATUSES.has(to)) {
    return { ok: false, code: "UNKNOWN_STATUS", message: "estado não reconhecido" };
  }
  if (from === to) {
    return { ok: false, code: "NOOP", message: "transição para o mesmo estado" };
  }
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, from)) {
    return { ok: false, code: "UNKNOWN_FROM", message: `estado origem desconhecido: ${from}` };
  }
  if (!isTransitionAllowed(from, to)) {
    return {
      ok: false,
      code: "TRANSITION_NOT_ALLOWED",
      message: `transição proibida: ${from} → ${to}`,
    };
  }
  return { ok: true };
}

module.exports = {
  ALLOWED_TRANSITIONS,
  isTransitionAllowed,
  validateTransitionPair,
};
