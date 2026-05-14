"use strict";

const { LifecycleState, LifecycleState_SET } = require("./constants");

/**
 * Helpers de lifecycle v1 — sem enforcement de transições (Fase 4.8.1).
 */

function isValidLifecycleState(value) {
  return value != null && LifecycleState_SET.has(String(value));
}

/**
 * @param {string} state
 * @returns {string}
 */
function assertValidLifecycleStateOrThrow(state) {
  const s = String(state || "");
  if (!isValidLifecycleState(s)) {
    throw new Error(`semantic_dep_graph: invalid lifecycle_state "${s}"`);
  }
  return s;
}

module.exports = {
  LifecycleState,
  isValidLifecycleState,
  assertValidLifecycleStateOrThrow,
};
