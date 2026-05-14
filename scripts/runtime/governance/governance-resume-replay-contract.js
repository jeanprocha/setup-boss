/**
 * Contratos padronizados — enforcement resume/replay (Fase 4.7.4).
 */

"use strict";

const {
  GOVERNANCE_APPROVAL_MANIFEST_FILENAME,
  GOVERNANCE_RESUME_BLOCKED_CODE,
  GOVERNANCE_REPLAY_BLOCKED_CODE,
  GOVERNANCE_STALE_APPROVAL_CODE,
  GOVERNANCE_INVALIDATED_GOVERNANCE_CODE,
  GOVERNANCE_AWAITING_APPROVAL_CODE,
  GOVERNANCE_LIFECYCLE_INVALID_CODE,
  GOVERNANCE_CONTINUITY_MISMATCH_CODE,
  GOVERNANCE_PIPELINE_BLOCKED_CODE,
} = require("./governance-runtime-constants");

function gateCodeForPhase(phase) {
  return phase === "replay" ? GOVERNANCE_REPLAY_BLOCKED_CODE : GOVERNANCE_RESUME_BLOCKED_CODE;
}

/** Subcódigos estáveis para telemetry payloads (`reason`). */
const GOVERNANCE_RESUME_REPLAY_REASON = Object.freeze({
  STALE_APPROVAL: "stale_approval",
  INVALIDATED_APPROVAL: "invalidated_approval",
  AWAITING_APPROVAL: "awaiting_approval",
  LIFECYCLE_BLOCKED: "lifecycle_blocked",
  LIFECYCLE_AWAITING_APPROVAL: "lifecycle_awaiting_approval",
  LIFECYCLE_CROSS_MANIFEST_INVALID: "lifecycle_cross_manifest_invalid",
  CONTINUITY_MISMATCH: "continuity_mismatch",
  RUNTIME_MANIFEST_MISSING: "runtime_manifest_missing",
});

/**
 * @param {"resume"|"replay"} phase
 * @param {string} subReason
 * @param {Record<string, unknown>} fields
 */
function buildGovernanceResumeReplayContract(phase, subReason, fields = {}) {
  const gate =
    phase === "replay" ? GOVERNANCE_REPLAY_BLOCKED_CODE : GOVERNANCE_RESUME_BLOCKED_CODE;
  const base = {
    gate,
    phase: String(phase || ""),
    reason: String(subReason || ""),
    replay_safe: true,
    ...fields,
  };
  return base;
}

function mapSubReasonToViolationCode(subReason) {
  switch (subReason) {
    case GOVERNANCE_RESUME_REPLAY_REASON.STALE_APPROVAL:
      return GOVERNANCE_STALE_APPROVAL_CODE;
    case GOVERNANCE_RESUME_REPLAY_REASON.INVALIDATED_APPROVAL:
      return GOVERNANCE_INVALIDATED_GOVERNANCE_CODE;
    case GOVERNANCE_RESUME_REPLAY_REASON.AWAITING_APPROVAL:
    case GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_AWAITING_APPROVAL:
      return GOVERNANCE_AWAITING_APPROVAL_CODE;
    case GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_CROSS_MANIFEST_INVALID:
      return GOVERNANCE_LIFECYCLE_INVALID_CODE;
    case GOVERNANCE_RESUME_REPLAY_REASON.CONTINUITY_MISMATCH:
    case GOVERNANCE_RESUME_REPLAY_REASON.RUNTIME_MANIFEST_MISSING:
      return GOVERNANCE_CONTINUITY_MISMATCH_CODE;
    case GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_BLOCKED:
      return GOVERNANCE_PIPELINE_BLOCKED_CODE;
    default:
      return gateCodeForPhase("resume");
  }
}

function humanMessageForViolation(phase, subReason, ctx = {}) {
  const manifest = GOVERNANCE_APPROVAL_MANIFEST_FILENAME;
  const aid = ctx.approval_id != null ? String(ctx.approval_id) : "";
  const prefix = phase === "replay" ? "GOVERNANCE_REPLAY_BLOCKED" : "GOVERNANCE_RESUME_BLOCKED";

  switch (subReason) {
    case GOVERNANCE_RESUME_REPLAY_REASON.STALE_APPROVAL:
      return `${prefix}: approval_id=${aid} status=STALE — contexto alterado; novo ciclo governance/review (${manifest} lineage).`;
    case GOVERNANCE_RESUME_REPLAY_REASON.INVALIDATED_APPROVAL:
      return `${prefix}: approval_id=${aid} status=INVALIDATED — não reutilizar; resolver ${manifest}.`;
    case GOVERNANCE_RESUME_REPLAY_REASON.AWAITING_APPROVAL:
      return `${prefix}: GOVERNANCE_AWAITING_APPROVAL approval_id=${aid} — resolver estado em ${manifest}.`;
    case GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_BLOCKED:
      return `${prefix}: governance-runtime lifecycle=BLOCKED — pipeline governance bloqueado.`;
    case GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_AWAITING_APPROVAL:
      return `${prefix}: governance-runtime lifecycle=AWAITING_APPROVAL — aguardar resolução HITL (${manifest}).`;
    case GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_CROSS_MANIFEST_INVALID:
      return `${prefix}: GOVERNANCE_LIFECYCLE_INVALID — governance-runtime.json e governance-approval.json em conflito (awaiting_approval vs status).`;
    case GOVERNANCE_RESUME_REPLAY_REASON.CONTINUITY_MISMATCH:
      return `${prefix}: GOVERNANCE_CONTINUITY_MISMATCH — fingerprint de continuidade não corresponde ao approval resolvido.`;
    case GOVERNANCE_RESUME_REPLAY_REASON.RUNTIME_MANIFEST_MISSING:
      return `${prefix}: GOVERNANCE_CONTINUITY_MISMATCH — governance-runtime.json ausente para approval resolvido com fingerprint.`;
    default:
      return `${prefix}: governance enforcement bloqueou ${phase}.`;
  }
}

module.exports = {
  GOVERNANCE_RESUME_REPLAY_REASON,
  buildGovernanceResumeReplayContract,
  mapSubReasonToViolationCode,
  gateCodeForPhase,
  humanMessageForViolation,
};
