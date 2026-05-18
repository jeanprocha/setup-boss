const path = require("path");
const { readJsonSafe } = require("./json-io");
const { loadArtifactsForStatus } = require("./operational-status");

function humanTaskTitle(taskField) {
  const raw = String(taskField || "").trim();
  if (!raw) return "(sem task)";
  const base = path.basename(raw, ".md");
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${s < 10 ? "0" : ""}${s}s`;
}

function durationFromRunLog(runLog) {
  if (!runLog || typeof runLog !== "object") return null;
  const started = runLog.started_at ? Date.parse(runLog.started_at) : NaN;
  const finished = runLog.finished_at ? Date.parse(runLog.finished_at) : NaN;
  if (Number.isFinite(started) && Number.isFinite(finished)) {
    return Math.max(0, finished - started);
  }
  const alt = runLog.cost_latency && runLog.cost_latency.total_duration_ms;
  if (Number.isFinite(alt) && alt > 0) return alt;
  return null;
}

function countChangedFiles(outputDir, runLog) {
  const changes = readJsonSafe(path.join(outputDir, "executor-changes.json"), 1_500_000);
  if (Array.isArray(changes)) return changes.length;

  if (runLog && Array.isArray(runLog.generated_files)) {
    const codeLike = runLog.generated_files.filter((f) => {
      const t = (f && f.type) || "";
      return (
        t === "executor_changes" ||
        t === "executor_result" ||
        String((f && f.path) || "").includes("executor-changes")
      );
    });
    if (codeLike.length) return codeLike.length;
  }

  return 0;
}

function extractCostUsd(metadata, runLog) {
  const fromMeta =
    metadata &&
    metadata.llm_usage_total &&
    metadata.llm_usage_total.estimated_cost_usd;
  if (fromMeta != null && Number.isFinite(Number(fromMeta))) {
    return Number(fromMeta);
  }
  const cl =
    runLog && runLog.cost_latency && runLog.cost_latency.estimated_cost_usd;
  if (cl != null && Number.isFinite(Number(cl))) return Number(cl);
  return null;
}

function summarizeRun(outputDir, indexEntry) {
  const {
    runLog,
    review,
    executorResult,
    architectVal,
    metadata,
    execution,
    op,
    runContext,
    isIntake,
    intake_classification,
    intake_confidence,
    phase1_status,
    intake_manifest,
  } = loadArtifactsForStatus(outputDir);

  let taskTitle = humanTaskTitle(
    (runLog && runLog.task) || (metadata && metadata.taskPath) || "",
  );
  if (isIntake) {
    const prev =
      (metadata && metadata.intake_task_preview) ||
      (runContext && runContext.task && runContext.task.preview) ||
      "";
    taskTitle = String(prev).trim().slice(0, 120) || "(intake)";
  }

  const durationMs = durationFromRunLog(runLog);
  const corrections =
    runLog && typeof runLog.correction_iterations === "number"
      ? runLog.correction_iterations
      : 0;

  const files = countChangedFiles(outputDir, runLog);
  const cost = extractCostUsd(metadata, runLog);

  const executionMode =
    (execution && execution.mode) ||
    (metadata && metadata.execution && metadata.execution.mode) ||
    op.execution_mode ||
    "apply";

  return {
    run_id: indexEntry.run_id,
    project_root:
      indexEntry.project_root ||
      (metadata && (metadata.project_root || metadata.projectRoot)) ||
      "",
    output_dir: outputDir,
    task_title: taskTitle,
    status: op.label,
    status_bucket: op.bucket,
    execution_mode: executionMode,
    duration_ms: durationMs,
    correction_iterations: corrections,
    changed_files: files,
    cost_usd: cost,
    runLog,
    metadata,
    execution,
    review,
    executorResult,
    architectVal,
    is_intake: Boolean(isIntake),
    intake_classification: isIntake ? intake_classification : null,
    intake_confidence: isIntake ? intake_confidence : null,
    phase1_status: isIntake ? phase1_status : null,
    intake_manifest: isIntake ? intake_manifest || null : null,
  };
}

module.exports = {
  summarizeRun,
  humanTaskTitle,
  formatDurationMs,
  durationFromRunLog,
  countChangedFiles,
  extractCostUsd,
};
