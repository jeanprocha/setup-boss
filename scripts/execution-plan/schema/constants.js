/**
 * Contrato Execution Plan — constantes de versão e enums estáveis.
 */

const EXECUTION_PLAN_SCHEMA_VERSION = 1;

/** Estados do ciclo de vida do plano (Fase 4.1 — núcleo inicial). */
const PLAN_LIFECYCLE_STATE = Object.freeze({
  DRAFT: "DRAFT",
  VALIDATED: "VALIDATED",
  APPROVED: "APPROVED",
  EXECUTING: "EXECUTING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
});

const PLAN_LIFECYCLE_TERMINAL = new Set([
  PLAN_LIFECYCLE_STATE.COMPLETED,
  PLAN_LIFECYCLE_STATE.FAILED,
  PLAN_LIFECYCLE_STATE.BLOCKED,
]);

/** Tipos de operação conhecidos na sombra (sem enforcement no executor). */
const PLAN_OPERATION_TYPE = Object.freeze({
  ARCHITECT_PLAN_STEP: "ARCHITECT_PLAN_STEP",
  FILE_SCOPE: "FILE_SCOPE",
  MARKER_NO_PATCH_YET: "MARKER_NO_PATCH_YET",
});

const PLAN_OPERATION_MODE = Object.freeze({
  SHADOW_DERIVED: "shadow_derived",
  INFORMATIONAL: "informational",
});

module.exports = {
  EXECUTION_PLAN_SCHEMA_VERSION,
  PLAN_LIFECYCLE_STATE,
  PLAN_LIFECYCLE_TERMINAL,
  PLAN_OPERATION_TYPE,
  PLAN_OPERATION_MODE,
};
