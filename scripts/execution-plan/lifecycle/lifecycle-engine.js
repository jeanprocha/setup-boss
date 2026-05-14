/**
 * Motor de ciclo de vida do Execution Plan — desacoplado da orquestração.
 */

const {
  PLAN_LIFECYCLE_STATE,
  PLAN_LIFECYCLE_TERMINAL,
} = require("../schema/constants");

/** @typedef {{ from: string, to: string, at: string, actor?: object|null, reason?: string|null, guard?: string|null }} PlanTransitionRecord */

const ALLOWED_EDGES = Object.freeze({
  [PLAN_LIFECYCLE_STATE.DRAFT]: new Set([
    PLAN_LIFECYCLE_STATE.VALIDATED,
    PLAN_LIFECYCLE_STATE.FAILED,
    PLAN_LIFECYCLE_STATE.BLOCKED,
  ]),
  [PLAN_LIFECYCLE_STATE.VALIDATED]: new Set([
    PLAN_LIFECYCLE_STATE.APPROVED,
    PLAN_LIFECYCLE_STATE.FAILED,
    PLAN_LIFECYCLE_STATE.BLOCKED,
  ]),
  [PLAN_LIFECYCLE_STATE.APPROVED]: new Set([
    PLAN_LIFECYCLE_STATE.EXECUTING,
    PLAN_LIFECYCLE_STATE.COMPLETED,
    PLAN_LIFECYCLE_STATE.FAILED,
    PLAN_LIFECYCLE_STATE.BLOCKED,
  ]),
  [PLAN_LIFECYCLE_STATE.EXECUTING]: new Set([
    PLAN_LIFECYCLE_STATE.APPROVED,
    PLAN_LIFECYCLE_STATE.COMPLETED,
    PLAN_LIFECYCLE_STATE.FAILED,
    PLAN_LIFECYCLE_STATE.BLOCKED,
  ]),
});

function isValidLifecycleState(state) {
  if (state == null || typeof state !== "string") return false;
  return Object.values(PLAN_LIFECYCLE_STATE).includes(state);
}

function isTerminalLifecycleState(state) {
  return PLAN_LIFECYCLE_TERMINAL.has(state);
}

/**
 * @param {string} from
 * @param {string} to
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
function canTransition(from, to, opts = {}) {
  const allowNoop = opts && opts.allowNoop === true;
  if (!isValidLifecycleState(from)) {
    return { ok: false, code: "INVALID_FROM", message: `Estado origem inválido: ${from}` };
  }
  if (!isValidLifecycleState(to)) {
    return { ok: false, code: "INVALID_TO", message: `Estado destino inválido: ${to}` };
  }
  if (from === to) {
    return allowNoop
      ? { ok: true, noop: true }
      : { ok: false, code: "NOOP", message: "Transição sem mudança de estado." };
  }
  if (isTerminalLifecycleState(from)) {
    return {
      ok: false,
      code: "TERMINAL_BLOCKED",
      message: `Estado terminal não pode transicionar: ${from}`,
    };
  }
  const edges = ALLOWED_EDGES[from];
  if (!edges || !edges.has(to)) {
    return {
      ok: false,
      code: "EDGE_DISALLOWED",
      message: `Transição não permitida: ${from} → ${to}`,
    };
  }
  return { ok: true };
}

/**
 * @param {{
 *   lifecycle_state: string,
 *   lifecycle_transitions?: PlanTransitionRecord[],
 * }} plan
 * @param {string} to
 * @param {{ actor?: object, reason?: string|null, guard?: string|null }} meta
 * @returns {{ ok: boolean, plan?: object, error?: { code: string, message: string } }}
 */
function applyTransition(plan, to, meta = {}) {
  if (!plan || typeof plan !== "object") {
    return {
      ok: false,
      error: { code: "BAD_PLAN", message: "Plano inválido." },
    };
  }
  const from = plan.lifecycle_state;
  if (meta.expectFrom != null && String(meta.expectFrom) !== String(from)) {
    return {
      ok: false,
      error: {
        code: "STALE_TRANSITION",
        message: `Estado actual (${from}) diferente do esperado (${meta.expectFrom}).`,
      },
    };
  }

  const gate = canTransition(from, to, { allowNoop: true });
  if (gate.noop) {
    return { ok: true, plan, noop: true };
  }
  if (!gate.ok) {
    return {
      ok: false,
      error: {
        code: gate.code || "TRANSITION_REJECTED",
        message: gate.message || "Transição rejeitada.",
      },
    };
  }

  const at = new Date().toISOString();
  const record = {
    from,
    to,
    at,
    actor:
      meta.actor && typeof meta.actor === "object"
        ? meta.actor
        : { kind: "runtime", component: "setup-boss-orchestration" },
    reason: meta.reason != null ? String(meta.reason) : null,
    guard: meta.guard != null ? String(meta.guard) : null,
  };
  const transitions = Array.isArray(plan.lifecycle_transitions)
    ? plan.lifecycle_transitions.slice()
    : [];
  transitions.push(record);
  const next = {
    ...plan,
    lifecycle_state: to,
    lifecycle_transitions: transitions,
    lifecycle_updated_at: at,
  };
  return { ok: true, plan: next };
}

module.exports = {
  ALLOWED_EDGES,
  isValidLifecycleState,
  isTerminalLifecycleState,
  canTransition,
  applyTransition,
};
