const path = require("path");
const { readJsonSafe } = require("./json-io");

/**
 * Rótulo curto para tabela + bucket para agregados em `status`.
 */
function deriveOperationalStatus(outputDir, extras = {}) {
  const runLog = extras.runLog;
  const review = extras.review;
  const executorResult = extras.executorResult;
  const architectVal = extras.architectVal;
  const execution = extras.execution;
  const dryRun =
    execution && typeof execution === "object" && execution.mode === "dry_run";

  const execMode =
    execution && typeof execution.mode === "string"
      ? execution.mode
      : "apply";

  const recoveryOutcome =
    execution &&
    typeof execution === "object" &&
    execution.recovery_outcome === "RECOVERED_SUCCESSFULLY";

  const life =
    execution && typeof execution.lifecycle_state === "string"
      ? execution.lifecycle_state
      : "";

  if (life === "RETRY_EXHAUSTED" || life === "RECOVERY_FAILED") {
    return {
      label: life,
      bucket: "blocked",
      execution_mode: execMode,
    };
  }

  if (architectVal && architectVal.invalid_task === true) {
    return {
      label: "INVALID_TASK",
      bucket: "blocked",
      execution_mode: execMode,
    };
  }

  if (review && typeof review === "object") {
    const s = String(review.status || "").toLowerCase();
    if (s === "approved") {
      if (recoveryOutcome) {
        return {
          label: "RECOVERED_SUCCESSFULLY",
          bucket: "approved",
          execution_mode: execMode,
        };
      }
      return {
        label: dryRun ? "DRY_RUN_APPROVED" : "APPROVED",
        bucket: "approved",
        execution_mode: execMode,
      };
    }
    if (s === "blocked") {
      return {
        label: dryRun ? "DRY_RUN_BLOCKED" : "BLOCKED",
        bucket: "blocked",
        execution_mode: execMode,
      };
    }
    if (s === "rejected") {
      return {
        label: dryRun ? "DRY_RUN_REJECTED" : "REJECTED",
        bucket: "rejected",
        execution_mode: execMode,
      };
    }
  }

  if (executorResult && typeof executorResult === "object") {
    const st = String(executorResult.status || "").toLowerCase();
    if (st === "blocked") {
      return {
        label: dryRun ? "DRY_RUN_EXEC_BLOCKED" : "BLOCKED",
        bucket: "blocked",
        execution_mode: execMode,
      };
    }
  }

  const rs = runLog && String(runLog.status || "").toLowerCase();

  if (rs === "running") {
    return {
      label: dryRun ? "DRY_RUN_RUNNING" : "RUNNING",
      bucket: "running",
      execution_mode: execMode,
    };
  }
  if (rs === "failed") {
    return {
      label: dryRun ? "DRY_RUN_FAILED" : "FAILED",
      bucket: "rejected",
      execution_mode: execMode,
    };
  }
  if (rs === "partial") {
    return {
      label: dryRun ? "DRY_RUN_PARTIAL" : "PARTIAL",
      bucket: "blocked",
      execution_mode: execMode,
    };
  }
  if (rs === "success" && !review) {
    return {
      label: dryRun ? "DRY_RUN_APPROVED" : "APPROVED",
      bucket: "approved",
      execution_mode: execMode,
    };
  }

  return {
    label: "UNKNOWN",
    bucket: "unknown",
    execution_mode: execMode,
  };
}

function loadArtifactsForStatus(outputDir) {
  const runLog = readJsonSafe(path.join(outputDir, "run-log.json"), 2_500_000);
  const review = readJsonSafe(path.join(outputDir, "review-output.json"), 512_000);
  const executorResult = readJsonSafe(
    path.join(outputDir, "executor-result.json"),
    256_000,
  );
  const architectVal = readJsonSafe(
    path.join(outputDir, "architect-validation.json"),
    256_000,
  );
  const metadata = readJsonSafe(path.join(outputDir, "metadata.json"), 2_500_000);
  const execution = metadata && metadata.execution;

  const op = deriveOperationalStatus(outputDir, {
    runLog,
    review,
    executorResult,
    architectVal,
    execution,
  });

  return { runLog, review, executorResult, architectVal, metadata, execution, op };
}

module.exports = {
  deriveOperationalStatus,
  loadArtifactsForStatus,
};
