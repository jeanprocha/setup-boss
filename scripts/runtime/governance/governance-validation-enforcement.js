/**
 * Enforcement v1 — validation critical (só decisão centralizada; só leitura de artefactos).
 */

const fs = require("fs");
const path = require("path");
const { VALIDATION_RESULTS_FILENAME } = require("../../validation-runtime/constants");
const { normalizeEvaluation } = require("./governance-runtime-aggregator");
const { GovernanceEnforcementError } = require("./governance-enforcement-error");
const { GovernanceAwaitingApprovalError } = require("./governance-awaiting-approval-error");
const { requestGovernanceApproval } = require("./governance-approval-runtime");
const { emitGovernanceRuntimeTelemetry } = require("./governance-runtime-telemetry");
const {
  appendEvaluations,
  saveGovernanceRuntimeManifest,
  setAwaitingHumanApproval,
} = require("./governance-runtime-manifest");
const {
  GOVERNANCE_HOOK_PHASE,
  VALIDATION_CRITICAL_RESOLUTION_APPROVAL,
} = require("./governance-runtime-constants");

function readJsonIfExists(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * Extensão opcional do contrato de validation-results (sem alterar o runtime de validation).
 * @param {object} row
 * @returns {string|null}
 */
function extractGovernanceSeverity(row) {
  if (!row || typeof row !== "object") return null;
  const o = row.output && typeof row.output === "object" ? row.output : {};
  const m = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const ext = row.extensions && typeof row.extensions === "object" ? row.extensions : {};
  const raw = o.governance_severity ?? m.governance_severity ?? ext.governance_severity;
  if (raw == null) return null;
  return String(raw).trim().toUpperCase();
}

/**
 * @param {string} outputDir
 * @returns {{
 *   hasCritical: boolean,
 *   evaluations: import("./governance-runtime-aggregator").GovernanceNormalizedEvaluation[],
 *   blocker_codes: string[],
 * }}
 */
function buildValidationCriticalDecision(outputDir) {
  const dir = String(outputDir || "");
  const evaluations = [];
  const blocker_codes = [];
  if (!dir) {
    return { hasCritical: false, evaluations, blocker_codes };
  }

  const results = readJsonIfExists(path.join(dir, VALIDATION_RESULTS_FILENAME));
  const validators = results && Array.isArray(results.validators) ? results.validators : [];

  for (const row of validators) {
    if (!row || typeof row !== "object") continue;
    const st = row.status != null ? String(row.status) : "";
    const vid = row.validator_id != null ? String(row.validator_id) : "";

    if (st === "error") {
      const code = "VALIDATION_VALIDATOR_ERROR";
      blocker_codes.push(`${code}:${vid || "unknown"}`);
      evaluations.push(
        normalizeEvaluation({
          phase: GOVERNANCE_HOOK_PHASE.POST_VALIDATION,
          source_runtime: "validation",
          severity: "BLOCK",
          code,
          message: `validator status=error id=${vid || "unknown"}`,
          replay_safe: true,
          evidence_refs: [VALIDATION_RESULTS_FILENAME],
        }),
      );
      continue;
    }

    if (st === "failed") {
      const g = extractGovernanceSeverity(row);
      if (g === "BLOCK" || g === "CRITICAL") {
        const code = "VALIDATION_GOVERNANCE_SEVERITY";
        blocker_codes.push(`${code}:${vid || "unknown"}:${g}`);
        evaluations.push(
          normalizeEvaluation({
            phase: GOVERNANCE_HOOK_PHASE.POST_VALIDATION,
            source_runtime: "validation",
            severity: "BLOCK",
            code,
            message: `governance_severity=${g} validator_id=${vid || "unknown"}`,
            replay_safe: true,
            evidence_refs: [VALIDATION_RESULTS_FILENAME],
          }),
        );
      }
    }
  }

  return {
    hasCritical: evaluations.length > 0,
    evaluations,
    blocker_codes,
  };
}

/**
 * @param {{
 *   outputDir: string,
 *   runId: string,
 *   manifest: object,
 *   telemetry: object|null,
 *   sink: object,
 *   allow_hard_enforcement: boolean,
 *   validationCriticalResolution?: string,
 * }} args
 * @returns {{ blocked: boolean, report_only?: boolean }}
 */
function applyPostValidationGovernanceEnforcement(args) {
  const outputDir = args && args.outputDir ? String(args.outputDir) : "";
  const runId = args && args.runId != null ? String(args.runId) : "";
  const manifest = args && args.manifest;
  const telemetry = args && args.telemetry;
  const sink = args && args.sink;
  const allow_hard_enforcement = args && args.allow_hard_enforcement === true;
  const validationCriticalResolution =
    args && args.validationCriticalResolution === VALIDATION_CRITICAL_RESOLUTION_APPROVAL
      ? VALIDATION_CRITICAL_RESOLUTION_APPROVAL
      : "block";

  if (!outputDir || !manifest) return { blocked: false };

  const decision = buildValidationCriticalDecision(outputDir);
  if (!decision.hasCritical) return { blocked: false };

  appendEvaluations(manifest, decision.evaluations);
  saveGovernanceRuntimeManifest(outputDir, manifest);

  const payloadBase = {
    run_id: runId,
    source_runtime: "validation",
    governance_phase: GOVERNANCE_HOOK_PHASE.POST_VALIDATION,
    blocker_codes: decision.blocker_codes,
    replay_safe: true,
  };

  if (allow_hard_enforcement) {
    if (validationCriticalResolution === VALIDATION_CRITICAL_RESOLUTION_APPROVAL) {
      const req = requestGovernanceApproval({
        outputDir,
        runId,
        governancePhase: GOVERNANCE_HOOK_PHASE.POST_VALIDATION,
        blockerCodes: decision.blocker_codes,
        telemetry,
        sink,
      });
      if (req.ok && req.approval_id) {
        setAwaitingHumanApproval(manifest, req.approval_id);
        appendEvaluations(manifest, [
          normalizeEvaluation({
            phase: GOVERNANCE_HOOK_PHASE.POST_VALIDATION,
            source_runtime: "governance",
            severity: "INFO",
            code: "GOVERNANCE_HITL_AWAITING",
            message: `Aguardando aprovação humana — approval_id=${req.approval_id}`,
            replay_safe: true,
            evidence_refs: ["governance-approval.json"],
          }),
        ]);
        saveGovernanceRuntimeManifest(outputDir, manifest);
        throw new GovernanceAwaitingApprovalError(
          "Governance em pausa — validation critical requer aprovação (governance-approval.json).",
          {
            approval_id: req.approval_id,
            governance_phase: GOVERNANCE_HOOK_PHASE.POST_VALIDATION,
            blocker_codes: decision.blocker_codes,
            replay_safe: true,
            loggerHandled: true,
          },
        );
      }
    }

    emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.enforcement.hard", payloadBase);
    emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.pipeline.blocked", {
      ...payloadBase,
      reason: "validation_critical",
    });
    throw new GovernanceEnforcementError(
      "Governance bloqueou o pipeline — validation critical (mode=enforce).",
      {
        source_runtime: "validation",
        governance_phase: GOVERNANCE_HOOK_PHASE.POST_VALIDATION,
        blocker_codes: decision.blocker_codes,
        replay_safe: true,
        loggerHandled: true,
      },
    );
  }

  emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.enforcement.report_only", payloadBase);
  return { blocked: false, report_only: true };
}

module.exports = {
  extractGovernanceSeverity,
  buildValidationCriticalDecision,
  applyPostValidationGovernanceEnforcement,
};
