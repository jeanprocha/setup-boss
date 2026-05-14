/**
 * Estados formais do ciclo de vida temporal do runtime (Fase 2.5).
 */

const RUNTIME_LIFECYCLE = {
  PREFLIGHT: "PREFLIGHT",
  ARCHITECTING: "ARCHITECTING",
  EXECUTING: "EXECUTING",
  /** Micro-recovery / retries do executor sem correction loop. */
  RECOVERING: "RECOVERING",
  /** Recovery concluiu e o executor prosseguiu com sucesso na mesma fase. */
  RECOVERED: "RECOVERED",
  REVIEWING: "REVIEWING",
  CORRECTING: "CORRECTING",
  DRY_RUN_APPROVED: "DRY_RUN_APPROVED",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  AWAITING_APPLY: "AWAITING_APPLY",
  APPLYING: "APPLYING",
  APPLIED: "APPLIED",
  FAILED: "FAILED",
  RESUMABLE: "RESUMABLE",
  REPLAYING: "REPLAYING",
  POLICY_BLOCKED: "POLICY_BLOCKED",
  POLICY_OVERRIDE: "POLICY_OVERRIDE",
  /** Recovery não pôde contornar a falha de forma segura. */
  RECOVERY_FAILED: "RECOVERY_FAILED",
  /** Orçamento de retry esgotado. */
  RETRY_EXHAUSTED: "RETRY_EXHAUSTED",
};

const ALL_STATES = new Set(Object.values(RUNTIME_LIFECYCLE));

function isValidLifecycleState(s) {
  return typeof s === "string" && ALL_STATES.has(s);
}

module.exports = {
  RUNTIME_LIFECYCLE,
  ALL_STATES,
  isValidLifecycleState,
};
