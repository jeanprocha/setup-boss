/**
 * Continuidade replay-safe do Governance Runtime (Fase 4.7.3) — sincronização e enforcement.
 */

"use strict";

const { loadGovernanceApprovalManifest, saveGovernanceApprovalManifest } = require("./governance-approval-manifest");
const { loadGovernanceRuntimeManifest, saveGovernanceRuntimeManifest } = require("./governance-runtime-manifest");
const { emitGovernanceRuntimeTelemetry, createGovernanceRuntimeNdjsonSink } = require("./governance-runtime-telemetry");
const {
  GOVERNANCE_APPROVAL_STATUS,
} = require("./governance-runtime-constants");
const {
  buildGovernanceContinuityPack,
  persistRuntimeContinuityFields,
  stableStringify,
} = require("./governance-continuity-fingerprint");
const { classifySemanticStale } = require("./governance-semantic-continuity");

/**
 * Sincroniza fingerprint no governance-runtime.json e marca approval resolvido como STALE se divergir.
 *
 * @param {string} outputDir
 * @param {{ telemetry?: object|null, sink?: object }} opts
 */
function syncGovernanceContinuityAndStaleApproval(outputDir, opts = {}) {
  const dir = String(outputDir || "");
  const telemetry = opts.telemetry;
  const sink = opts.sink || { appendNdjson() {} };

  const gr = loadGovernanceRuntimeManifest(dir);
  if (!gr) {
    return {
      ok: true,
      governance_continuity_fingerprint: null,
      approval_stale_written: false,
    };
  }

  const evals = Array.isArray(gr.evaluations) ? gr.evaluations : [];
  const blockers = Array.isArray(gr.blockers) ? gr.blockers : [];
  const pack = buildGovernanceContinuityPack(dir, evals, blockers);
  persistRuntimeContinuityFields(gr, pack);
  saveGovernanceRuntimeManifest(dir, gr);

  const approval = loadGovernanceApprovalManifest(dir);
  const resolved = new Set([
    GOVERNANCE_APPROVAL_STATUS.APPROVED,
    GOVERNANCE_APPROVAL_STATUS.OVERRIDDEN,
  ]);

  let approval_stale_written = false;
  if (
    approval &&
    resolved.has(String(approval.status || "").toUpperCase()) &&
    approval.governance_continuity_fingerprint
  ) {
    const bound = String(approval.governance_continuity_fingerprint);
    const govDivergence = bound !== pack.governance_continuity_fingerprint;
    const semBound =
      approval.semantic_continuity_fingerprint != null
        ? String(approval.semantic_continuity_fingerprint)
        : "";
    const semCur =
      pack.semantic_continuity_fingerprint != null
        ? String(pack.semantic_continuity_fingerprint)
        : "";
    const divergenceDetail =
      semBound && semBound !== semCur
        ? classifySemanticStale(
            semBound,
            semCur,
            approval.semantic_continuity_inputs,
            pack.semantic_continuity_inputs,
          )
        : null;

    /** Divergência só semântica quando o agregador governance (legado) coincide. */
    let explicitSemanticStale = false;
    if (semBound && semBound !== semCur) {
      explicitSemanticStale = true;
    }

    if (govDivergence || explicitSemanticStale) {
      approval.status = GOVERNANCE_APPROVAL_STATUS.STALE;
      approval.lineage = approval.lineage && typeof approval.lineage === "object" ? approval.lineage : {};
      approval.lineage.invalidated_at = new Date().toISOString();
      approval.lineage.invalidated_by =
        govDivergence ? "continuity:artifact_or_governance_drift" : "semantic:continuity_divergence";

      approval.lineage.continuity_reason = govDivergence
        ? explicitSemanticStale
          ? "continuity_and_semantic_fingerprint_divergence"
          : "continuity_fingerprint_divergence"
        : explicitSemanticStale
          ? "semantic_only_fingerprint_divergence"
          : "continuity_fingerprint_divergence";

      approval.lineage.previous_semantic_fingerprint = semBound || null;
      if (explicitSemanticStale) {
        const div = divergenceDetail && divergenceDetail.divergence ? divergenceDetail.divergence : null;
        const topReason =
          div && Array.isArray(div.reasons_sorted)
            ? div.reasons_sorted[0]
            : "semantic_digest_mismatch";
        approval.lineage.semantic_invalidated_by = "semantic:continuity_fingerprint_divergence";
        approval.lineage.semantic_continuity_reason = topReason;
      } else {
        approval.lineage.semantic_invalidated_by = null;
        approval.lineage.semantic_continuity_reason = null;
      }
      saveGovernanceApprovalManifest(dir, approval);
      approval_stale_written = true;
      emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.continuity.stale", {
        run_id: approval.run_id,
        approval_id: approval.approval_id,
        bound_fingerprint: bound.slice(0, 16),
        current_fingerprint: pack.governance_continuity_fingerprint.slice(0, 16),
        replay_safe: true,
      });
      emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.approval.invalidated", {
        run_id: approval.run_id,
        approval_id: approval.approval_id,
        status: GOVERNANCE_APPROVAL_STATUS.STALE,
        replay_safe: true,
      });
      if (explicitSemanticStale) {
        emitGovernanceRuntimeTelemetry(telemetry, sink, "semantic.continuity.stale", {
          run_id: approval.run_id,
          approval_id: approval.approval_id,
          bound_sem_prefix: semBound.slice(0, 16),
          current_sem_prefix: semCur.slice(0, 16),
          replay_safe: true,
          governance_divergence: govDivergence === true,
        });
        emitGovernanceRuntimeTelemetry(telemetry, sink, "semantic.approval.invalidated", {
          run_id: approval.run_id,
          approval_id: approval.approval_id,
          status: GOVERNANCE_APPROVAL_STATUS.STALE,
          replay_safe: true,
        });
      }

    }
  }

  if (approval_stale_written) {
    const grRefresh = loadGovernanceRuntimeManifest(dir);
    if (grRefresh) {
      saveGovernanceRuntimeManifest(dir, grRefresh);
    }
  }

  return {
    ok: true,
    governance_continuity_fingerprint: pack.governance_continuity_fingerprint,
    approval_stale_written,
    pack,
  };
}

const {
  validateGovernanceContinuityAgainstApproval,
  enforceGovernanceReplayGate,
} = require("./governance-state-validator");

/**
 * Camada replay-safe: falha explícita se continuidade não bater com approval resolvido.
 *
 * @param {string} outputDir
 * @param {{ telemetry?: object|null, sink?: object }} opts
 */
function enforceReplayGovernanceContinuity(outputDir, opts = {}) {
  const sink = opts.sink || createGovernanceRuntimeNdjsonSink(outputDir);
  syncGovernanceContinuityAndStaleApproval(outputDir, { ...opts, sink });
  enforceGovernanceReplayGate(outputDir, { ...opts, sink });
  return true;
}

module.exports = {
  stableStringify,
  buildGovernanceContinuityPack,
  persistRuntimeContinuityFields,
  syncGovernanceContinuityAndStaleApproval,
  validateGovernanceContinuityAgainstApproval,
  enforceReplayGovernanceContinuity,
};
