/**
 * Relatório agregado para inspect: lifecycle temporal, replay, resume, drift.
 */

const fs = require("fs");
const path = require("path");
const { readPatchManifest } = require("./patch-manifest");
const { readCheckpoints } = require("./checkpoint-manager");
const {
  validateFilesystemAgainstManifest,
  validateExecutorChangesIntegrity,
} = require("./drift-detector");
const { assessResume } = require("./resume-engine");

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

/**
 * Passos replayáveis de forma isolada (presença mínima de artefactos).
 */
function replayStepsAvailability(outputDir) {
  const steps = {
    executor: false,
    review: false,
    correction: false,
  };

  const metaPath = path.join(outputDir, "metadata.json");
  const runCtxPath = path.join(outputDir, "run-context.json");

  if (
    fileExists(metaPath) &&
    fileExists(runCtxPath) &&
    fileExists(path.join(outputDir, "executor-result.json"))
  ) {
    steps.executor = true;
  }

  if (
    fileExists(path.join(outputDir, "executor-output.md")) &&
    fileExists(path.join(outputDir, "executor-result.json"))
  ) {
    steps.review = true;
  }

  if (fileExists(path.join(outputDir, "review-output.json"))) {
    steps.correction = true;
  }

  return steps;
}

function buildTemporalInspectReport(outputDir, projectRootFallback = null) {
  const metaPath = path.join(outputDir, "metadata.json");
  const meta = readJson(metaPath);
  const projectRoot =
    (meta && meta.projectRoot) ||
    projectRootFallback ||
    "";

  const exec = (meta && meta.execution) || {};
  const lifecycle = exec.lifecycle_state || "—";

  const manifest = readPatchManifest(outputDir);
  const checkpoints = readCheckpoints(outputDir);

  let drift = "UNKNOWN";
  if (manifest && projectRoot) {
    const v = validateFilesystemAgainstManifest(projectRoot, manifest);
    drift = v.ok ? "CLEAN" : "DRIFT_DETECTED";
  } else if (manifest && !projectRoot) {
    drift = "UNKNOWN";
  } else {
    drift = "NO_MANIFEST";
  }

  const resumeInfo = assessResume(outputDir);
  const replaySteps = replayStepsAvailability(outputDir);

  const physicalApply = fileExists(
    path.join(outputDir, "physical-apply-result.json"),
  );
  const applyMarker = readJson(
    path.join(outputDir, "physical-apply-result.json"),
  );

  let staleManifest = false;
  if (manifest && fileExists(path.join(outputDir, "executor-changes.json"))) {
    const integ = validateExecutorChangesIntegrity(outputDir, manifest);
    staleManifest = !integ.ok;
  }

  const checkpointDoc = checkpoints;
  const invalidCheckpointDoc =
    checkpointDoc != null &&
    (checkpointDoc.schema_version !== 1 ||
      !Array.isArray(checkpointDoc.checkpoints));

  return {
    lifecycle_state: lifecycle,
    execution_mode: exec.mode || "—",
    pending_apply: exec.pending_apply === true,
    physical_apply_completed:
      physicalApply && applyMarker && applyMarker.completed === true,
    replay_available:
      replaySteps.executor || replaySteps.review || replaySteps.correction,
    replay_steps: replaySteps,
    resume_available: resumeInfo.ok === true,
    resume_reason: resumeInfo.ok ? null : resumeInfo.reason,
    resume_next: resumeInfo.next_phase || null,
    filesystem_drift_summary: drift,
    drift_detail_errors:
      drift === "DRIFT_DETECTED" && manifest && projectRoot
        ? validateFilesystemAgainstManifest(projectRoot, manifest).errors
        : [],
    checkpoints_count:
      checkpoints && Array.isArray(checkpoints.checkpoints)
        ? checkpoints.checkpoints.length
        : 0,
    stale_manifest: staleManifest,
    invalid_checkpoint_doc: Boolean(invalidCheckpointDoc),
  };
}

module.exports = {
  buildTemporalInspectReport,
  replayStepsAvailability,
};
