/**
 * Avaliação de resume seguro + entrada para retomar o pipeline.
 */

const fs = require("fs");
const path = require("path");
const { readCheckpoints, lastCheckpoint } = require("./checkpoint-manager");
const { readPatchManifest } = require("./patch-manifest");
const {
  validateExecutorChangesIntegrity,
} = require("./drift-detector");
const { GOVERNANCE_APPROVAL_MANIFEST_FILENAME } = require("../governance/governance-approval-runtime");
const {
  syncGovernanceContinuityAndStaleApproval,
} = require("../governance/governance-continuity");
const {
  createGovernanceRuntimeNdjsonSink,
} = require("../governance/governance-runtime-telemetry");
const {
  evaluateGovernanceResumeReplayGate,
} = require("../governance/governance-state-validator");

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

function executorSucceeded(outputDir) {
  const r = readJson(path.join(outputDir, "executor-result.json"));
  return r && r.status === "success";
}

function reviewPresent(outputDir) {
  return fs.existsSync(path.join(outputDir, "review-output.json"));
}

/**
 * @param {{ readOnly?: boolean }} [opts] — `readOnly`: não corre sync nem escreve telemetry (diagnostics).
 * @returns {{ ok: boolean, reason?: string, next_phase?: string, meta?: object }}
 */
function assessResume(outputDir, opts = {}) {
  const readOnly = opts.readOnly === true;
  const metaPath = path.join(outputDir, "metadata.json");
  if (!fs.existsSync(metaPath)) {
    return { ok: false, reason: "RUN_NOT_RESUMABLE: metadata.json ausente." };
  }

  const meta = readJson(metaPath);
  if (!meta || !meta.taskArg || !meta.projectArg) {
    return {
      ok: false,
      reason: "RUN_NOT_RESUMABLE: metadata sem taskArg/projectArg.",
    };
  }

  const noopSink = { appendNdjson() {} };
  const sink = readOnly ? noopSink : createGovernanceRuntimeNdjsonSink(outputDir);
  if (!readOnly) {
    syncGovernanceContinuityAndStaleApproval(outputDir, { sink });
  }

  const govGate = evaluateGovernanceResumeReplayGate(outputDir, "resume", { sink });
  if (!govGate.ok) {
    const v = govGate.violation;
    const awaiting =
      v && v.subReason === "awaiting_approval" ? true : undefined;
    const staleish =
      v &&
      (v.subReason === "stale_approval" || v.subReason === "invalidated_approval");
    return {
      ok: false,
      reason: v.message,
      governance_resume_blocked: true,
      governance_resume_blocked_stale: staleish === true ? true : undefined,
      governance_approval_pending: awaiting,
      approval_manifest: GOVERNANCE_APPROVAL_MANIFEST_FILENAME,
      approval_id: v.approval_id || "",
      governance_contract: v.contract,
      meta,
    };
  }

  const logPath = path.join(outputDir, "run-log.json");
  const runLog = readJson(logPath);

  if (
    runLog &&
    runLog.status === "success" &&
    reviewPresent(outputDir)
  ) {
    const rev = readJson(path.join(outputDir, "review-output.json"));
    if (rev && rev.status === "approved") {
      return {
        ok: false,
        reason: "RUN_NOT_RESUMABLE: pipeline já concluído com sucesso.",
      };
    }
  }

  const manifest = readPatchManifest(outputDir);
  if (manifest && meta.projectRoot) {
    const integ = validateExecutorChangesIntegrity(outputDir, manifest);
    if (!integ.ok) {
      return {
        ok: false,
        reason: `RUN_NOT_RESUMABLE: manifest/executor-changes inconsistentes — ${integ.errors.join("; ")}`,
      };
    }
  }

  const cp = lastCheckpoint(outputDir);

  if (!executorSucceeded(outputDir)) {
    const arch = path.join(outputDir, "run-context.json");
    const scanOrSkip = path.join(outputDir, "scan-output.md");
    if (
      fs.existsSync(arch) &&
      (fs.existsSync(scanOrSkip) || meta.scan?.skipped === true)
    ) {
      return {
        ok: true,
        next_phase: "executor",
        meta,
        reason: null,
      };
    }
    return {
      ok: false,
      reason:
        "RUN_NOT_RESUMABLE: executor incompleto e artefactos de architect/scan em falta.",
    };
  }

  if (!reviewPresent(outputDir)) {
    return {
      ok: true,
      next_phase: "review",
      meta,
      reason: null,
    };
  }

  const rev = readJson(path.join(outputDir, "review-output.json"));

  if (
    rev &&
    rev.status === "rejected" &&
    rev.requires_correction === true
  ) {
    const hasCorr = fs.existsSync(
      path.join(outputDir, "correction-instructions.md"),
    );
    if (hasCorr) {
      return {
        ok: true,
        next_phase: "executor",
        meta,
        reason: null,
      };
    }
    return {
      ok: true,
      next_phase: "correction",
      meta,
      reason: null,
    };
  }

  if (
    runLog &&
    runLog.status === "running" &&
    executorSucceeded(outputDir) &&
    !reviewPresent(outputDir)
  ) {
    return { ok: true, next_phase: "review", meta, reason: null };
  }

  if (
    runLog &&
    (runLog.status === "failed" || runLog.status === "partial") &&
    executorSucceeded(outputDir) &&
    !reviewPresent(outputDir)
  ) {
    return { ok: true, next_phase: "review", meta, reason: null };
  }

  return {
    ok: false,
    reason:
      "RUN_NOT_RESUMABLE: estado não reconhecido ou artefactos parciais demais.",
    checkpoint_hint: cp && cp.phase_completed,
  };
}

module.exports = {
  assessResume,
};
