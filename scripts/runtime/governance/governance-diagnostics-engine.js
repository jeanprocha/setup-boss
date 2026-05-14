/**
 * Governance diagnostics — só leitura (Fase 4.7.5). Não sincroniza nem repara manifests.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const {
  GOVERNANCE_RUNTIME_MANIFEST_FILENAME,
  GOVERNANCE_APPROVAL_MANIFEST_FILENAME,
  GOVERNANCE_RUNTIME_TELEMETRY_FILENAME,
  GOVERNANCE_DIAGNOSTICS_FILENAME,
  GOVERNANCE_DIAGNOSTICS_SCHEMA_VERSION,
  GOVERNANCE_APPROVAL_STATUS,
} = require("./governance-runtime-constants");
const { loadGovernanceRuntimeManifest } = require("./governance-runtime-manifest");
const { loadGovernanceApprovalManifest } = require("./governance-approval-manifest");
const { buildGovernanceContinuityPack, stableStringify } = require("./governance-continuity-fingerprint");
const { summarizeSemanticGovernanceContinuity } = require("./governance-semantic-continuity");
const {
  validateGovernanceApprovalState,
  validateGovernanceRuntimeState,
  validateGovernanceBlockerLineage,
  validateGovernanceContinuityAgainstApproval,
  evaluateGovernanceResumeReplayGate,
} = require("./governance-state-validator");
const { assessResume } = require("../replay/resume-engine");

const NOOP_SINK = Object.freeze({ appendNdjson() {} });

function sortKeysDeep(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  const o = {};
  for (const k of Object.keys(v).sort()) {
    o[k] = sortKeysDeep(v[k]);
  }
  return o;
}

/**
 * @param {string} outputDir
 * @returns {{
 *   events_total: number,
 *   kinds: Record<string, number>,
 *   replay_blocks: number,
 *   resume_blocks: number,
 *   stale_events: number,
 *   invalidation_events: number,
 *   hitl_required_events: number,
 * }}
 */
function summarizeGovernanceTelemetryNdjson(outputDir) {
  const dir = String(outputDir || "");
  const p = path.join(dir, GOVERNANCE_RUNTIME_TELEMETRY_FILENAME);
  const kinds = {};
  let replay_blocks = 0;
  let resume_blocks = 0;
  let stale_events = 0;
  let invalidation_events = 0;
  let hitl_required_events = 0;
  let semantic_replay_blocks = 0;
  let semantic_resume_blocks = 0;
  let semantic_stale_like_events = 0;

  if (!fs.existsSync(p)) {
    return {
      events_total: 0,
      kinds: {},
      replay_blocks: 0,
      resume_blocks: 0,
      stale_events: 0,
      invalidation_events: 0,
      hitl_required_events: 0,
      semantic_replay_blocks: 0,
      semantic_resume_blocks: 0,
      semantic_stale_like_events: 0,
    };
  }

  const raw = fs.readFileSync(p, "utf8");
  const lines = raw.split(/\r?\n/).filter((ln) => ln.trim());
  for (const ln of lines) {
    let rec;
    try {
      rec = JSON.parse(ln);
    } catch (_) {
      continue;
    }
    const kind = rec && rec.kind != null ? String(rec.kind) : "";
    if (!kind) continue;
    kinds[kind] = (kinds[kind] || 0) + 1;
    if (kind === "governance.replay.blocked") replay_blocks += 1;
    if (kind === "governance.resume.blocked") resume_blocks += 1;
    if (kind === "governance.continuity.stale") stale_events += 1;
    if (
      kind === "governance.approval.invalidated" ||
      kind === "governance.lifecycle.invalid"
    ) {
      invalidation_events += 1;
    }
    if (kind === "governance.hitl.required") hitl_required_events += 1;
    if (kind === "semantic.replay.blocked") semantic_replay_blocks += 1;
    if (kind === "semantic.resume.blocked") semantic_resume_blocks += 1;
    if (kind === "semantic.continuity.stale" || kind === "semantic.approval.invalidated")
      semantic_stale_like_events += 1;
  }

  const sortedKinds = {};
  for (const k of Object.keys(kinds).sort()) {
    sortedKinds[k] = kinds[k];
  }

  return {
    events_total: lines.length,
    kinds: sortedKinds,
    replay_blocks,
    resume_blocks,
    stale_events,
    invalidation_events,
    hitl_required_events,
    semantic_replay_blocks,
    semantic_resume_blocks,
    semantic_stale_like_events,
  };
}

function orphanApprovalBlockers(approval, gr) {
  if (!approval || !gr || typeof approval !== "object" || typeof gr !== "object") {
    return [];
  }
  if (String(approval.status || "").toUpperCase() !== GOVERNANCE_APPROVAL_STATUS.PENDING) {
    return [];
  }
  const want = Array.isArray(approval.blocker_codes)
    ? approval.blocker_codes.map((x) => String(x)).sort()
    : [];
  const have = new Set(
    Array.isArray(gr.blockers)
      ? gr.blockers.map((b) => (b && b.code != null ? String(b.code) : ""))
      : [],
  );
  have.delete("");
  return want.filter((c) => !have.has(c));
}

function serializeGateViolation(v) {
  if (!v || typeof v !== "object") return null;
  return sortKeysDeep({
    sub_reason: v.subReason != null ? String(v.subReason) : "",
    violation_code: v.violation_code != null ? String(v.violation_code) : "",
    message: v.message != null ? String(v.message) : "",
    approval_id: v.approval_id != null ? String(v.approval_id) : "",
    contract: v.contract && typeof v.contract === "object" ? sortKeysDeep(v.contract) : null,
  });
}

function collectConsistencyIssues(gr, approval, continuityResult, lineageOk, orphans) {
  /** @type {{ code: string, severity: string, message: string }[]} */
  const issues = [];

  const grPresent = gr != null;
  const apPresent = approval != null;

  if (!grPresent) {
    issues.push({
      code: "MANIFEST_GOVERNANCE_RUNTIME_MISSING",
      severity: "warn",
      message: `${GOVERNANCE_RUNTIME_MANIFEST_FILENAME} ausente.`,
    });
  }
  if (!apPresent) {
    issues.push({
      code: "MANIFEST_GOVERNANCE_APPROVAL_MISSING",
      severity: "info",
      message: `${GOVERNANCE_APPROVAL_MANIFEST_FILENAME} ausente.`,
    });
  }

  const apVal = validateGovernanceApprovalState(approval);
  if (!apVal.ok && !apVal.skipped) {
    issues.push({
      code: "GOVERNANCE_APPROVAL_STATE_BLOCKS_FLOW",
      severity: "error",
      message: `approval: sub_reason=${apVal.subReason || ""} approval_id=${apVal.approval_id || ""}`,
    });
  }

  const rtVal = validateGovernanceRuntimeState(gr, approval);
  if (!rtVal.ok && !rtVal.skipped) {
    issues.push({
      code: "GOVERNANCE_RUNTIME_LIFECYCLE_BLOCKS_OR_INVALID",
      severity: "error",
      message: `runtime vs approval: sub_reason=${rtVal.subReason || ""}`,
    });
  }

  if (lineageOk === false) {
    issues.push({
      code: "BLOCKER_LINEAGE_MISMATCH",
      severity: "error",
      message:
        "blocker_codes do approval PENDING não são subconjunto dos blockers em governance-runtime.",
    });
  }

  if (orphans && orphans.length) {
    issues.push({
      code: "ORPHAN_BLOCKER_CODES",
      severity: "warn",
      message: `Códigos só no approval: ${orphans.join(",")}`,
    });
  }

  if (continuityResult && continuityResult.ok === false) {
    issues.push({
      code: String(continuityResult.reason || "GOVERNANCE_CONTINUITY_MISMATCH"),
      severity: "error",
      message: "Fingerprint de continuidade diverge do approval resolvido ou runtime em falta.",
    });
  }

  issues.sort((a, b) => {
    const c = a.code.localeCompare(b.code);
    return c !== 0 ? c : a.message.localeCompare(b.message);
  });
  return issues;
}

function enforcementBlockerCodes(gr) {
  if (!gr || !Array.isArray(gr.evaluations)) return [];
  const out = [];
  for (const e of gr.evaluations) {
    if (!e || typeof e !== "object") continue;
    if (String(e.severity || "").toUpperCase() === "BLOCK" && e.code) {
      out.push(String(e.code));
    }
  }
  return [...new Set(out)].sort();
}

function computeWouldSyncMarkStale(dir, gr, approval) {
  if (!gr || !approval || typeof approval !== "object") {
    return {
      would_mark_stale: false,
      bound_fingerprint_prefix: "",
      current_fingerprint_prefix: "",
      bound_semantic_prefix: "",
      current_semantic_prefix: "",
      would_mark_stale_semantic_only: false,
    };
  }
  const st = String(approval.status || "").toUpperCase();
  const resolved = new Set([
    GOVERNANCE_APPROVAL_STATUS.APPROVED,
    GOVERNANCE_APPROVAL_STATUS.OVERRIDDEN,
  ]);
  if (!resolved.has(st) || !approval.governance_continuity_fingerprint) {
    return {
      would_mark_stale: false,
      bound_fingerprint_prefix: "",
      current_fingerprint_prefix: "",
      bound_semantic_prefix: "",
      current_semantic_prefix: "",
      would_mark_stale_semantic_only: false,
    };
  }
  const evals = Array.isArray(gr.evaluations) ? gr.evaluations : [];
  const blockers = Array.isArray(gr.blockers) ? gr.blockers : [];
  const pack = buildGovernanceContinuityPack(dir, evals, blockers);
  const bound = String(approval.governance_continuity_fingerprint);
  const cur = String(pack.governance_continuity_fingerprint || "");
  const semBound =
    approval.semantic_continuity_fingerprint != null ? String(approval.semantic_continuity_fingerprint) : "";
  const semCur =
    pack.semantic_continuity_fingerprint != null ? String(pack.semantic_continuity_fingerprint) : "";
  const semStaleExplicit = Boolean(semBound && semBound !== semCur);
  const wouldStaleAgg = bound !== cur || semStaleExplicit;
  return {
    would_mark_stale: wouldStaleAgg,
    bound_fingerprint_prefix: bound.slice(0, 16),
    current_fingerprint_prefix: cur.slice(0, 16),
    bound_semantic_prefix: semBound.slice(0, 16),
    current_semantic_prefix: semCur.slice(0, 16),
    would_mark_stale_semantic_only: Boolean(semStaleExplicit && bound === cur),
  };
}

function buildExplainability({
  replayGate,
  resumeGate,
  wouldStale,
  approval,
  continuityResult,
  enforcementCodes,
  semanticGovSnapshot,
}) {
  const explanations = {
    replay_blocked: null,
    resume_governance_blocked: null,
    stale_why: null,
    fingerprint_divergence: null,
    semantic_fingerprint_divergence: null,
    semantic_stale_reasons: null,
    semantic_propagation_divergence: null,
    enforcement_blocker_codes: enforcementCodes,
  };

  if (!replayGate.ok && replayGate.violation) {
    explanations.replay_blocked = String(replayGate.violation.message || "");
  }
  if (!resumeGate.ok && resumeGate.violation) {
    explanations.resume_governance_blocked = String(resumeGate.violation.message || "");
  }

  if (approval && typeof approval === "object") {
    const st = String(approval.status || "").toUpperCase();
    if (st === GOVERNANCE_APPROVAL_STATUS.STALE) {
      const lr =
        approval.lineage && typeof approval.lineage === "object"
          ? approval.lineage.continuity_reason || approval.lineage.invalidated_by
          : null;
      explanations.stale_why = lr
        ? `approval STALE persistido: ${String(lr)}`
        : "approval STALE — ver lineage em governance-approval.json.";
    } else if (wouldStale.would_mark_stale) {
      explanations.stale_why =
        wouldStale.would_mark_stale_semantic_only === true
          ? "Um sync de continuidade marcaria STALE por divergência apenas na continuidade semântica (fingerprints de grafo/propagação/integração)."
          : "Um sync de continuidade marcaria este approval como STALE: fingerprint ligado ao approval não coincide com o fingerprint actual derivado dos artefactos.";
      explanations.fingerprint_divergence = sortKeysDeep({
        bound_prefix: wouldStale.bound_fingerprint_prefix,
        current_prefix: wouldStale.current_fingerprint_prefix,
      });
      explanations.semantic_fingerprint_divergence = sortKeysDeep({
        bound_prefix: wouldStale.bound_semantic_prefix,
        current_prefix: wouldStale.current_semantic_prefix,
      });
    }
  }

  if (
    continuityResult &&
    continuityResult.ok === false &&
    continuityResult.reason === "GOVERNANCE_CONTINUITY_MISMATCH"
  ) {
    explanations.fingerprint_divergence = sortKeysDeep({
      bound_prefix:
        approval && approval.governance_continuity_fingerprint != null
          ? String(approval.governance_continuity_fingerprint).slice(0, 16)
          : "",
      current_prefix:
        continuityResult.pack && continuityResult.pack.governance_continuity_fingerprint != null
          ? String(continuityResult.pack.governance_continuity_fingerprint).slice(0, 16)
          : "",
    });
    if (continuityResult.semantic_continuity_mismatch) {
      explanations.semantic_fingerprint_divergence = sortKeysDeep({
        bound_prefix:
          approval && approval.semantic_continuity_fingerprint != null
            ? String(approval.semantic_continuity_fingerprint).slice(0, 16)
            : "",
        current_prefix:
          continuityResult.pack && continuityResult.pack.semantic_continuity_fingerprint != null
            ? String(continuityResult.pack.semantic_continuity_fingerprint).slice(0, 16)
            : "",
      });
    }
  }

  if (semanticGovSnapshot && typeof semanticGovSnapshot === "object") {
    if (semanticGovSnapshot.stale_reasons_sorted && semanticGovSnapshot.stale_reasons_sorted.length) {
      explanations.semantic_stale_reasons = semanticGovSnapshot.stale_reasons_sorted.slice();
    }
    if (
      semanticGovSnapshot.propagation_divergence_sorted &&
      semanticGovSnapshot.propagation_divergence_sorted.length
    ) {
      explanations.semantic_propagation_divergence = sortKeysDeep({
        propagation_divergence_kinds_sorted: semanticGovSnapshot.propagation_divergence_sorted,
      });
    }
  }

  return explanations;
}

/**
 * @param {string} outputDir
 * @param {{ persist?: boolean }} [opts]
 */
function buildGovernanceDiagnosticsReport(outputDir, opts = {}) {
  const persist = opts.persist !== false;
  const dir = path.resolve(String(outputDir || ""));

  const grPresent = fs.existsSync(path.join(dir, GOVERNANCE_RUNTIME_MANIFEST_FILENAME));
  const apPresent = fs.existsSync(path.join(dir, GOVERNANCE_APPROVAL_MANIFEST_FILENAME));

  const gr = loadGovernanceRuntimeManifest(dir);
  const approval = loadGovernanceApprovalManifest(dir);

  const continuityResult = validateGovernanceContinuityAgainstApproval(dir, {
    telemetry: null,
    sink: NOOP_SINK,
  });

  const lineageOk = validateGovernanceBlockerLineage(approval, gr).ok;
  const orphans = orphanApprovalBlockers(approval, gr);

  const replayGate = evaluateGovernanceResumeReplayGate(dir, "replay", {
    telemetry: null,
    sink: NOOP_SINK,
  });
  const resumeGovGate = evaluateGovernanceResumeReplayGate(dir, "resume", {
    telemetry: null,
    sink: NOOP_SINK,
  });

  const resumePipeline = assessResume(dir, { readOnly: true });

  const wouldStale = computeWouldSyncMarkStale(dir, gr, approval);
  const telemetry_summary = summarizeGovernanceTelemetryNdjson(dir);
  const enforcementCodes = enforcementBlockerCodes(gr);

  const semanticGovSnapshot = summarizeSemanticGovernanceContinuity(dir);

  const issues = collectConsistencyIssues(
    gr,
    approval,
    continuityResult,
    lineageOk,
    orphans,
  );

  const lineage_summary =
    approval && approval.lineage && typeof approval.lineage === "object"
      ? sortKeysDeep(approval.lineage)
      : null;

  /** @type {Record<string, unknown>} */
  const report = {
    schema_version: GOVERNANCE_DIAGNOSTICS_SCHEMA_VERSION,
    diagnostics_revision: "4.7.5",
    generated_at: new Date().toISOString(),
    output_dir_basename: path.basename(dir),
    manifests: sortKeysDeep({
      governance_runtime: {
        filename: GOVERNANCE_RUNTIME_MANIFEST_FILENAME,
        present: grPresent,
      },
      governance_approval: {
        filename: GOVERNANCE_APPROVAL_MANIFEST_FILENAME,
        present: apPresent,
      },
      telemetry_ndjson: {
        filename: GOVERNANCE_RUNTIME_TELEMETRY_FILENAME,
        present: fs.existsSync(path.join(dir, GOVERNANCE_RUNTIME_TELEMETRY_FILENAME)),
      },
    }),
    governance_runtime_summary: gr
      ? sortKeysDeep({
          lifecycle_state: gr.lifecycle_state != null ? String(gr.lifecycle_state) : "",
          mode: gr.mode != null ? String(gr.mode) : "",
          governance_continuity_fingerprint_prefix:
            gr.governance_continuity_fingerprint != null
              ? String(gr.governance_continuity_fingerprint).slice(0, 16)
              : "",
          semantic_continuity_fingerprint_prefix:
            gr.semantic_continuity_fingerprint != null
              ? String(gr.semantic_continuity_fingerprint).slice(0, 16)
              : "",
          blockers_count: Array.isArray(gr.blockers) ? gr.blockers.length : 0,
          evaluations_count: Array.isArray(gr.evaluations) ? gr.evaluations.length : 0,
        })
      : null,
    governance_approval_summary: approval
      ? sortKeysDeep({
          status: approval.status != null ? String(approval.status) : "",
          approval_id: approval.approval_id != null ? String(approval.approval_id) : "",
          governance_phase:
            approval.governance_phase != null ? String(approval.governance_phase) : "",
          governance_continuity_fingerprint_prefix:
            approval.governance_continuity_fingerprint != null
              ? String(approval.governance_continuity_fingerprint).slice(0, 16)
              : "",
          semantic_continuity_fingerprint_prefix:
            approval.semantic_continuity_fingerprint != null
              ? String(approval.semantic_continuity_fingerprint).slice(0, 16)
              : "",
        })
      : null,
    continuity_readonly: sortKeysDeep({
      status: continuityResult.skipped ? "skipped" : continuityResult.ok ? "ok" : "mismatch",
      reason: continuityResult.reason != null ? String(continuityResult.reason) : null,
      skipped_legacy_no_bound_fingerprint: continuityResult.legacy_no_bound_fingerprint === true,
      semantic_continuity_mismatch: continuityResult.semantic_continuity_mismatch === true,
    }),
    would_sync_mark_stale: sortKeysDeep(wouldStale),
    consistency: sortKeysDeep({
      issues,
      orphan_blocker_codes: orphans.slice().sort(),
      blocker_lineage_ok: lineageOk,
    }),
    eligibility: sortKeysDeep({
      replay_governance: replayGate.ok
        ? { ok: true }
        : { ok: false, violation: serializeGateViolation(replayGate.violation) },
      resume_governance: resumeGovGate.ok
        ? { ok: true }
        : { ok: false, violation: serializeGateViolation(resumeGovGate.violation) },
      resume_pipeline: sortKeysDeep({
        ok: resumePipeline.ok === true,
        reason: resumePipeline.reason != null ? String(resumePipeline.reason) : null,
        next_phase: resumePipeline.next_phase != null ? String(resumePipeline.next_phase) : null,
        governance_resume_blocked: resumePipeline.governance_resume_blocked === true,
        governance_approval_pending: resumePipeline.governance_approval_pending === true,
      }),
      replay_eligible_governance: replayGate.ok === true,
      resume_eligible_governance: resumeGovGate.ok === true,
      resume_eligible_pipeline: resumePipeline.ok === true,
    }),
    semantic_governance_continuity: sortKeysDeep(semanticGovSnapshot),
    lineage_summary,
    telemetry_summary: sortKeysDeep(telemetry_summary),
    explanations: sortKeysDeep(
      buildExplainability({
        replayGate,
        resumeGate: resumeGovGate,
        wouldStale,
        approval,
        continuityResult,
        enforcementCodes,
        semanticGovSnapshot,
      }),
    ),
  };

  const sortedReport = sortKeysDeep(report);

  if (persist) {
    const outPath = path.join(dir, GOVERNANCE_DIAGNOSTICS_FILENAME);
    fs.writeFileSync(outPath, stableStringify(sortedReport), "utf8");
  }

  return sortedReport;
}

module.exports = {
  buildGovernanceDiagnosticsReport,
  summarizeGovernanceTelemetryNdjson,
  sortKeysDeep,
  NOOP_SINK,
};
