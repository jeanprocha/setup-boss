/**
 * Validador central — estado governance para resume/replay (Fase 4.7.4).
 */

"use strict";

const { loadGovernanceApprovalManifest } = require("./governance-approval-manifest");
const { loadGovernanceRuntimeManifest } = require("./governance-runtime-manifest");
const {
  GOVERNANCE_APPROVAL_STATUS,
  GOVERNANCE_RUNTIME_LIFECYCLE,
  GOVERNANCE_APPROVAL_MANIFEST_FILENAME,
  GOVERNANCE_REPLAY_BLOCKED_CODE,
  GOVERNANCE_CONTINUITY_MISMATCH_CODE,
  GOVERNANCE_LIFECYCLE_INVALID_CODE,
} = require("./governance-runtime-constants");
const { emitGovernanceRuntimeTelemetry } = require("./governance-runtime-telemetry");
const { buildGovernanceContinuityPack } = require("./governance-continuity-fingerprint");
const {
  GOVERNANCE_RESUME_REPLAY_REASON,
  buildGovernanceResumeReplayContract,
  mapSubReasonToViolationCode,
  humanMessageForViolation,
} = require("./governance-resume-replay-contract");
const { GovernanceEnforcementError } = require("./governance-enforcement-error");

/**
 * @param {object|null|undefined} approval
 * @returns {{ ok: boolean, skipped?: boolean, subReason?: string, approval_id?: string }}
 */
function validateGovernanceApprovalState(approval) {
  if (!approval || typeof approval !== "object") {
    return { ok: true, skipped: true };
  }
  const st = String(approval.status || "").toUpperCase();
  const aid = approval.approval_id != null ? String(approval.approval_id) : "";

  if (st === GOVERNANCE_APPROVAL_STATUS.STALE) {
    return {
      ok: false,
      subReason: GOVERNANCE_RESUME_REPLAY_REASON.STALE_APPROVAL,
      approval_id: aid,
    };
  }
  if (st === GOVERNANCE_APPROVAL_STATUS.INVALIDATED) {
    return {
      ok: false,
      subReason: GOVERNANCE_RESUME_REPLAY_REASON.INVALIDATED_APPROVAL,
      approval_id: aid,
    };
  }
  if (st === GOVERNANCE_APPROVAL_STATUS.PENDING) {
    return {
      ok: false,
      subReason: GOVERNANCE_RESUME_REPLAY_REASON.AWAITING_APPROVAL,
      approval_id: aid,
    };
  }
  return { ok: true, approval_id: aid };
}

/**
 * Cross-check extensions.v1.awaiting_approval vs approval.status.
 *
 * @param {object|null|undefined} gr
 * @param {object|null|undefined} approval
 * @returns {{ ok: boolean, skipped?: boolean, subReason?: string }}
 */
function validateGovernanceRuntimeState(gr, approval) {
  if (!gr || typeof gr !== "object") {
    return { ok: true, skipped: true };
  }

  const lc = String(gr.lifecycle_state || "").toUpperCase();

  if (lc === GOVERNANCE_RUNTIME_LIFECYCLE.BLOCKED) {
    return { ok: false, subReason: GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_BLOCKED };
  }
  if (lc === GOVERNANCE_RUNTIME_LIFECYCLE.AWAITING_APPROVAL) {
    return { ok: false, subReason: GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_AWAITING_APPROVAL };
  }

  const v1 =
    gr.extensions && gr.extensions.v1 && typeof gr.extensions.v1 === "object"
      ? gr.extensions.v1
      : null;
  if (!v1 || !approval || typeof approval !== "object") {
    return { ok: true };
  }

  const awaitingFlag = v1.awaiting_approval === true;
  const apSt = String(approval.status || "").toUpperCase();

  if (awaitingFlag && apSt !== GOVERNANCE_APPROVAL_STATUS.PENDING) {
    return { ok: false, subReason: GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_CROSS_MANIFEST_INVALID };
  }
  if (!awaitingFlag && apSt === GOVERNANCE_APPROVAL_STATUS.PENDING) {
    return { ok: false, subReason: GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_CROSS_MANIFEST_INVALID };
  }

  return { ok: true };
}

/**
 * Continuidade replay-safe: fingerprint atual vs approval resolvido (APPROVED/OVERRIDDEN).
 *
 * @param {string} outputDir
 * @param {{ telemetry?: object|null, sink?: object }} opts
 */
function validateGovernanceContinuityAgainstApproval(outputDir, opts = {}) {
  const dir = String(outputDir || "");
  const telemetry = opts.telemetry;
  const sink = opts.sink || { appendNdjson() {} };

  const approval = loadGovernanceApprovalManifest(dir);
  if (!approval) {
    return { ok: true, skipped: true };
  }

  const st = String(approval.status || "").toUpperCase();
  const resolved = new Set([
    GOVERNANCE_APPROVAL_STATUS.APPROVED,
    GOVERNANCE_APPROVAL_STATUS.OVERRIDDEN,
  ]);

  const gr = loadGovernanceRuntimeManifest(dir);
  if (!gr) {
    if (resolved.has(st) && approval.governance_continuity_fingerprint) {
      return {
        ok: false,
        reason: "GOVERNANCE_RUNTIME_MANIFEST_MISSING",
        approval_id: approval.approval_id,
      };
    }
    return { ok: true, skipped: true };
  }

  const evals = Array.isArray(gr.evaluations) ? gr.evaluations : [];
  const blockers = Array.isArray(gr.blockers) ? gr.blockers : [];
  const pack = buildGovernanceContinuityPack(dir, evals, blockers);

  if (!resolved.has(st)) {
    return { ok: true, skipped: true, pack };
  }

  const bound = approval.governance_continuity_fingerprint
    ? String(approval.governance_continuity_fingerprint)
    : "";
  if (!bound) {
    return { ok: true, skipped: true, legacy_no_bound_fingerprint: true, pack };
  }

  if (bound === pack.governance_continuity_fingerprint) {
    const semBound =
      approval.semantic_continuity_fingerprint != null
        ? String(approval.semantic_continuity_fingerprint)
        : "";
    const semCur =
      pack.semantic_continuity_fingerprint != null
        ? String(pack.semantic_continuity_fingerprint)
        : "";
    if (semBound && semBound !== semCur) {
      return {
        ok: false,
        reason: "GOVERNANCE_CONTINUITY_MISMATCH",
        pack,
        approval_id: approval.approval_id,
        semantic_continuity_mismatch: true,
      };
    }

    emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.continuity.valid", {
      run_id: approval.run_id,
      approval_id: approval.approval_id,
      replay_safe: true,
    });

    emitGovernanceRuntimeTelemetry(telemetry, sink, "semantic.continuity.valid", {
      run_id: approval.run_id,
      approval_id: approval.approval_id,
      replay_safe: true,
      semantic_bound: Boolean(semBound),
    });

    return { ok: true, pack };
  }

  return {
    ok: false,
    reason: "GOVERNANCE_CONTINUITY_MISMATCH",
    pack,
    approval_id: approval.approval_id,
  };
}

/**
 * Verifica alinhamento simples blocker_codes (approval) vs manifest.blockers (linhagem).
 *
 * @param {object|null|undefined} approval
 * @param {object|null|undefined} gr
 * @returns {{ ok: boolean, skipped?: boolean }}
 */
function validateGovernanceBlockerLineage(approval, gr) {
  if (!approval || !gr || typeof approval !== "object" || typeof gr !== "object") {
    return { ok: true, skipped: true };
  }
  if (String(approval.status || "").toUpperCase() !== GOVERNANCE_APPROVAL_STATUS.PENDING) {
    return { ok: true, skipped: true };
  }
  const want = Array.isArray(approval.blocker_codes)
    ? new Set(approval.blocker_codes.map((x) => String(x)))
    : new Set();
  const have = Array.isArray(gr.blockers)
    ? new Set(gr.blockers.map((b) => (b && b.code != null ? String(b.code) : "")))
    : new Set();
  have.delete("");
  if (want.size === 0 || have.size === 0) return { ok: true };
  for (const code of want) {
    if (!have.has(code)) {
      return { ok: false };
    }
  }
  return { ok: true };
}

/**
 * @param {object} violation
 * @param {"resume"|"replay"} phase
 */
function emitTelemetryForViolation(violation, phase, telemetry, sink) {
  const base = {
    phase,
    replay_safe: true,
    violation_code: violation.violation_code,
    reason: violation.subReason,
    approval_id: violation.approval_id || "",
    ...(violation.detail ? { detail: violation.detail } : {}),
  };

  if (violation.subReason === GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_CROSS_MANIFEST_INVALID) {
    emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.lifecycle.invalid", {
      ...base,
    });
  }

  const gateKind =
    phase === "replay" ? "governance.replay.blocked" : "governance.resume.blocked";
  emitGovernanceRuntimeTelemetry(telemetry, sink, gateKind, {
    ...base,
    message: violation.message,
  });
}

/**
 * Avaliação única para resume ou replay (após sync opcional feito pelo caller).
 *
 * @param {string} outputDir
 * @param {"resume"|"replay"} phase
 * @param {{ telemetry?: object|null, sink?: object }} opts
 * @returns {{ ok: true } | { ok: false, violation: object }}
 */
function evaluateGovernanceResumeReplayGate(outputDir, phase, opts = {}) {
  const telemetry = opts.telemetry;
  const sink = opts.sink || { appendNdjson() {} };
  const dir = String(outputDir || "");

  const approval = loadGovernanceApprovalManifest(dir);
  const gr = loadGovernanceRuntimeManifest(dir);

  const a1 = validateGovernanceApprovalState(approval);
  if (!a1.ok) {
    const subReason = /** @type {string} */ (a1.subReason);
    const violation_code = mapSubReasonToViolationCode(subReason);
    const message = humanMessageForViolation(phase, subReason, {
      approval_id: a1.approval_id,
    });
    const violation = {
      subReason,
      violation_code,
      message,
      approval_id: a1.approval_id || "",
      contract: buildGovernanceResumeReplayContract(phase, subReason, {
        violation_code,
        approval_id: a1.approval_id || "",
        manifest: GOVERNANCE_APPROVAL_MANIFEST_FILENAME,
      }),
    };
    emitTelemetryForViolation(violation, phase, telemetry, sink);
    return { ok: false, violation };
  }

  const r1 = validateGovernanceRuntimeState(gr, approval);
  if (!r1.ok) {
    const subReason = /** @type {string} */ (r1.subReason);
    const violation_code = mapSubReasonToViolationCode(subReason);
    const message = humanMessageForViolation(phase, subReason, {});
    const violation = {
      subReason,
      violation_code,
      message,
      approval_id: approval && approval.approval_id != null ? String(approval.approval_id) : "",
      contract: buildGovernanceResumeReplayContract(phase, subReason, { violation_code }),
    };
    emitTelemetryForViolation(violation, phase, telemetry, sink);
    return { ok: false, violation };
  }

  const lineage = validateGovernanceBlockerLineage(approval, gr);
  if (!lineage.ok) {
    const subReason = GOVERNANCE_RESUME_REPLAY_REASON.LIFECYCLE_CROSS_MANIFEST_INVALID;
    const violation_code = GOVERNANCE_LIFECYCLE_INVALID_CODE;
    const message = humanMessageForViolation(phase, subReason, {});
    const violation = {
      subReason,
      violation_code,
      message,
      approval_id: approval && approval.approval_id != null ? String(approval.approval_id) : "",
      detail: "blocker_lineage_mismatch",
      contract: buildGovernanceResumeReplayContract(phase, subReason, {
        violation_code,
        detail: "blocker_lineage_mismatch",
      }),
    };
    emitTelemetryForViolation(violation, phase, telemetry, sink);
    return { ok: false, violation };
  }

  const c = validateGovernanceContinuityAgainstApproval(dir, { telemetry, sink });
  if (!c.ok) {
    const subReason =
      c.reason === "GOVERNANCE_RUNTIME_MANIFEST_MISSING"
        ? GOVERNANCE_RESUME_REPLAY_REASON.RUNTIME_MANIFEST_MISSING
        : GOVERNANCE_RESUME_REPLAY_REASON.CONTINUITY_MISMATCH;
    const violation_code = GOVERNANCE_CONTINUITY_MISMATCH_CODE;
    const message = humanMessageForViolation(phase, subReason, {
      approval_id: c.approval_id,
    });
    const violation = {
      subReason,
      violation_code,
      message,
      approval_id: c.approval_id != null ? String(c.approval_id) : "",
      contract: buildGovernanceResumeReplayContract(phase, subReason, {
        violation_code,
        continuity_reason: c.reason || "",
      }),
    };
    const boundPrev =
      approval && approval.governance_continuity_fingerprint != null
        ? String(approval.governance_continuity_fingerprint).slice(0, 16)
        : "";
    const currentFp =
      c.pack && c.pack.governance_continuity_fingerprint != null
        ? String(c.pack.governance_continuity_fingerprint).slice(0, 16)
        : "";
    emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.continuity.mismatch", {
      phase,
      replay_safe: true,
      approval_id: violation.approval_id,
      bound_fingerprint: boundPrev,
      current_fingerprint: currentFp,
      continuity_reason: c.reason || "",
    });

    const semGateKind =
      phase === "replay" ? "semantic.replay.blocked" : "semantic.resume.blocked";
    if (c.semantic_continuity_mismatch) {
      emitGovernanceRuntimeTelemetry(telemetry, sink, semGateKind, {
        phase,
        replay_safe: true,
        approval_id: violation.approval_id,
        semantic_mismatch: true,
      });

      emitGovernanceRuntimeTelemetry(telemetry, sink, "semantic.continuity.stale", {
        phase,
        replay_safe: true,
        approval_id: violation.approval_id,
        gate_blocked: true,
      });
    }

    emitTelemetryForViolation(violation, phase, telemetry, sink);
    return { ok: false, violation };
  }

  return { ok: true };
}

/**
 * Replay: lança GovernanceEnforcementError se bloqueado.
 *
 * @param {string} outputDir
 * @param {{ telemetry?: object|null, sink?: object }} opts
 */
function enforceGovernanceReplayGate(outputDir, opts = {}) {
  const gate = evaluateGovernanceResumeReplayGate(outputDir, "replay", opts);
  if (!gate.ok) {
    const v = gate.violation;
    throw new GovernanceEnforcementError(v.message, {
      code: GOVERNANCE_REPLAY_BLOCKED_CODE,
      source_runtime: "governance_replay",
      governance_phase: "replay",
      replay_safe: true,
      blocker_codes: [],
      loggerHandled: false,
    });
  }
}

module.exports = {
  validateGovernanceApprovalState,
  validateGovernanceRuntimeState,
  validateGovernanceContinuityAgainstApproval,
  validateGovernanceBlockerLineage,
  evaluateGovernanceResumeReplayGate,
  enforceGovernanceReplayGate,
};
