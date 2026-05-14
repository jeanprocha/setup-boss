/**
 * Approval runtime v1 — só contratos filesystem; sem UI/daemon.
 */

const {
  GOVERNANCE_APPROVAL_MANIFEST_FILENAME,
  GOVERNANCE_APPROVAL_STATUS,
} = require("./governance-runtime-constants");
const {
  buildGovernanceApprovalManifest,
  loadGovernanceApprovalManifest,
  saveGovernanceApprovalManifest,
  computeApprovalScopeFingerprint,
  computeApprovalId,
} = require("./governance-approval-manifest");
const {
  loadGovernanceRuntimeManifest,
  saveGovernanceRuntimeManifest,
  applyHitlResolutionToManifest,
} = require("./governance-runtime-manifest");
const { emitGovernanceRuntimeTelemetry } = require("./governance-runtime-telemetry");
const { buildGovernanceContinuityPack } = require("./governance-continuity-fingerprint");

/**
 * @param {{
 *   outputDir: string,
 *   runId: string,
 *   governancePhase: string,
 *   blockerCodes: string[],
 *   telemetry?: { emit?: Function }|null,
 *   sink?: { appendNdjson?: Function },
 * }} args
 */
function requestGovernanceApproval(args) {
  const out = String(args.outputDir || "");
  const runId = args.runId != null ? String(args.runId) : "";
  const governancePhase = String(args.governancePhase || "");
  const blockerCodes = Array.isArray(args.blockerCodes) ? args.blockerCodes.map(String) : [];
  if (!out || !runId) return { ok: false, reason: "missing_output_dir_or_run_id" };

  const prev = loadGovernanceApprovalManifest(out);
  const supersededStatuses = new Set([
    GOVERNANCE_APPROVAL_STATUS.APPROVED,
    GOVERNANCE_APPROVAL_STATUS.OVERRIDDEN,
    GOVERNANCE_APPROVAL_STATUS.STALE,
    GOVERNANCE_APPROVAL_STATUS.INVALIDATED,
    GOVERNANCE_APPROVAL_STATUS.REJECTED,
  ]);
  const telemetry = args.telemetry;
  const sink = args.sink || { appendNdjson() {} };

  if (prev && supersededStatuses.has(String(prev.status || "").toUpperCase())) {
    emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.approval.invalidated", {
      run_id: prev.run_id,
      approval_id: prev.approval_id,
      prior_status: String(prev.status || ""),
      reason: "superseded_by_new_hitl_request",
      replay_safe: true,
    });
  }

  const gr = loadGovernanceRuntimeManifest(out);
  const evals = gr && Array.isArray(gr.evaluations) ? gr.evaluations : [];
  const blockers = gr && Array.isArray(gr.blockers) ? gr.blockers : [];
  const continuityPack = buildGovernanceContinuityPack(out, evals, blockers);

  /** @type {Record<string, unknown>} */
  let lineage = {
    previous_approval_id: null,
    previous_fingerprint: null,
    previous_semantic_fingerprint: null,
    invalidated_by: null,
    invalidated_at: null,
    continuity_reason: null,
    semantic_invalidated_by: null,
    semantic_continuity_reason: null,
  };
  if (prev && prev.approval_id) {
    lineage = {
      previous_approval_id: String(prev.approval_id),
      previous_fingerprint:
        prev.governance_continuity_fingerprint != null
          ? String(prev.governance_continuity_fingerprint)
          : null,
      previous_semantic_fingerprint:
        prev.semantic_continuity_fingerprint != null
          ? String(prev.semantic_continuity_fingerprint)
          : null,
      invalidated_by: "hitl:new_request",
      invalidated_at: new Date().toISOString(),
      continuity_reason: "superseded_by_new_hitl_request",
      semantic_invalidated_by: null,
      semantic_continuity_reason: null,
    };
  }

  const scopeFingerprint = computeApprovalScopeFingerprint(out, runId, governancePhase, blockerCodes);
  const approval_id = computeApprovalId(runId, governancePhase, scopeFingerprint);
  const doc = buildGovernanceApprovalManifest({
    run_id: runId,
    approval_id,
    governance_phase: governancePhase,
    blocker_codes: blockerCodes,
    requested_by_runtime: "governance-runtime",
    scope_fingerprint: scopeFingerprint,
    governance_continuity_fingerprint: continuityPack.governance_continuity_fingerprint,
    continuity_inputs: continuityPack.continuity_inputs,
    semantic_continuity_fingerprint:
      continuityPack.semantic_continuity_fingerprint != null
        ? String(continuityPack.semantic_continuity_fingerprint)
        : "",
    semantic_continuity_inputs: Array.isArray(continuityPack.semantic_continuity_inputs)
      ? continuityPack.semantic_continuity_inputs
      : [],
    lineage,
  });
  saveGovernanceApprovalManifest(out, doc);

  emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.hitl.required", {
    run_id: runId,
    approval_id,
    governance_phase: governancePhase,
    blocker_codes: blockerCodes,
    manifest: GOVERNANCE_APPROVAL_MANIFEST_FILENAME,
    governance_continuity_fingerprint: continuityPack.governance_continuity_fingerprint,
    replay_safe: true,
  });

  return {
    ok: true,
    approval_id,
    scope_fingerprint: scopeFingerprint,
    governance_continuity_fingerprint: continuityPack.governance_continuity_fingerprint,
    doc,
  };
}

function getGovernanceApprovalPending(outputDir) {
  const doc = loadGovernanceApprovalManifest(outputDir);
  if (!doc || typeof doc !== "object") return null;
  if (String(doc.status) !== GOVERNANCE_APPROVAL_STATUS.PENDING) return null;
  return doc;
}

/**
 * @param {{
 *   outputDir: string,
 *   status: string,
 *   actor?: string,
 *   channel?: string,
 *   note?: string,
 *   override_reason?: string,
 *   telemetry?: { emit?: Function }|null,
 *   sink?: { appendNdjson?: Function },
 * }} res
 */
function resolveGovernanceApproval(res) {
  const outputDir = String(res.outputDir || "");
  const statusRaw = res.status != null ? String(res.status).toUpperCase() : "";
  if (!outputDir) return { ok: false, reason: "missing_output_dir" };

  const doc = loadGovernanceApprovalManifest(outputDir);
  if (!doc || typeof doc !== "object") {
    return { ok: false, reason: "approval_manifest_missing" };
  }
  if (String(doc.status) !== GOVERNANCE_APPROVAL_STATUS.PENDING) {
    return { ok: false, reason: "approval_not_pending", status: doc.status };
  }

  const allowed = new Set([
    GOVERNANCE_APPROVAL_STATUS.APPROVED,
    GOVERNANCE_APPROVAL_STATUS.REJECTED,
    GOVERNANCE_APPROVAL_STATUS.OVERRIDDEN,
  ]);
  if (!allowed.has(statusRaw)) {
    return { ok: false, reason: "invalid_resolution_status" };
  }

  const grPre = loadGovernanceRuntimeManifest(outputDir);
  const evalsPre = grPre && Array.isArray(grPre.evaluations) ? grPre.evaluations : [];
  const blockersPre = grPre && Array.isArray(grPre.blockers) ? grPre.blockers : [];
  const packAtResolve = buildGovernanceContinuityPack(outputDir, evalsPre, blockersPre);
  const bound = doc.governance_continuity_fingerprint
    ? String(doc.governance_continuity_fingerprint)
    : "";
  if (
    bound &&
    (statusRaw === GOVERNANCE_APPROVAL_STATUS.APPROVED ||
      statusRaw === GOVERNANCE_APPROVAL_STATUS.OVERRIDDEN) &&
    bound !== packAtResolve.governance_continuity_fingerprint
  ) {
    return {
      ok: false,
      reason: "governance_continuity_mismatch_at_resolve",
      expected_fingerprint: bound,
      current_fingerprint: packAtResolve.governance_continuity_fingerprint,
    };
  }

  const semBound =
    doc.semantic_continuity_fingerprint != null ? String(doc.semantic_continuity_fingerprint) : "";
  const semCur =
    packAtResolve.semantic_continuity_fingerprint != null
      ? String(packAtResolve.semantic_continuity_fingerprint)
      : "";
  if (
    semBound &&
    (statusRaw === GOVERNANCE_APPROVAL_STATUS.APPROVED ||
      statusRaw === GOVERNANCE_APPROVAL_STATUS.OVERRIDDEN) &&
    semBound !== semCur
  ) {
    return {
      ok: false,
      reason: "semantic_continuity_mismatch_at_resolve",
      expected_semantic_fingerprint: semBound,
      current_semantic_fingerprint: semCur,
    };
  }

  const ts = new Date().toISOString();
  doc.status = statusRaw;
  doc.resolved_at = ts;
  const entry = {
    at: ts,
    actor: res.actor != null ? String(res.actor) : "unknown",
    channel: res.channel != null ? String(res.channel) : "filesystem",
    note: res.note != null ? String(res.note) : "",
  };

  if (statusRaw === GOVERNANCE_APPROVAL_STATUS.OVERRIDDEN) {
    doc.overrides = Array.isArray(doc.overrides) ? doc.overrides : [];
    doc.overrides.push({
      ...entry,
      reason: res.override_reason != null ? String(res.override_reason) : "",
    });
  } else {
    doc.approvals = Array.isArray(doc.approvals) ? doc.approvals : [];
    doc.approvals.push(entry);
  }

  saveGovernanceApprovalManifest(outputDir, doc);

  const gManifest = loadGovernanceRuntimeManifest(outputDir);
  if (gManifest) {
    if (statusRaw === GOVERNANCE_APPROVAL_STATUS.APPROVED) {
      applyHitlResolutionToManifest(gManifest, "approved");
    } else if (statusRaw === GOVERNANCE_APPROVAL_STATUS.REJECTED) {
      applyHitlResolutionToManifest(gManifest, "rejected");
    } else if (statusRaw === GOVERNANCE_APPROVAL_STATUS.OVERRIDDEN) {
      applyHitlResolutionToManifest(gManifest, "overridden");
    }
    saveGovernanceRuntimeManifest(outputDir, gManifest);
  }

  const telemetry = res.telemetry;
  const sink = res.sink || { appendNdjson() {} };
  const base = {
    run_id: doc.run_id,
    approval_id: doc.approval_id,
    governance_phase: doc.governance_phase,
    replay_safe: true,
  };
  if (statusRaw === GOVERNANCE_APPROVAL_STATUS.APPROVED) {
    emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.hitl.approved", base);
  } else if (statusRaw === GOVERNANCE_APPROVAL_STATUS.REJECTED) {
    emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.hitl.rejected", base);
  } else {
    emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.hitl.override", {
      ...base,
      override_reason: res.override_reason != null ? String(res.override_reason) : "",
    });
  }

  return { ok: true, doc };
}

module.exports = {
  requestGovernanceApproval,
  getGovernanceApprovalPending,
  resolveGovernanceApproval,
  GOVERNANCE_APPROVAL_MANIFEST_FILENAME,
};
