"use strict";

const fs = require("fs");
const path = require("path");

const { ROOT_DIR, resolveOutputDir } = require("../../../core/run-resolver");
const { loadQueueUnsafe } = require("./queue-store");
const { emitRuntimeEvent } = require("./runtime-events");
const {
  readOrchestrationFromDisk,
  collectOrchestrationBootstrap,
  findActiveExecutionJob,
  JOB_KIND_RUN_EXECUTE,
} = require("./run-execute-api");
const { collectExecutionForRun } = require("./run-execution");
const { syncOrchestrationFromArtifacts } = require("./run-orchestration-sync");

const RUNS_INDEX_DIR = path.join(ROOT_DIR, ".setup-boss", "runs");

const ACTIVE_ORCH_STATES = new Set([
  "queued",
  "execution_starting",
  "execution_running",
  "execution_reviewing",
  "execution_correcting",
  "execution_recovering",
]);

const TERMINAL_LIFECYCLE = new Set([
  "execution_completed",
  "execution_failed",
  "execution_blocked",
]);

const ACTIVE_JOB_STATUSES = new Set(["pending", "running", "cancelling"]);

/** @typedef {"recovered"|"stale"|"orphaned"|"recovery_pending"|"recovery_failed"|null} RecoveryStatus */

/**
 * @param {string} fp
 */
function safeReadJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @returns {{ runId: string, outputDir: string, projectRoot: string|null }[]}
 */
function listRunIndexEntries() {
  /** @type {{ runId: string, outputDir: string, projectRoot: string|null }[]} */
  const out = [];
  try {
    if (!fs.existsSync(RUNS_INDEX_DIR)) return out;
    for (const name of fs.readdirSync(RUNS_INDEX_DIR)) {
      if (!name.endsWith(".json")) continue;
      const runId = name.slice(0, -5);
      const doc = safeReadJson(path.join(RUNS_INDEX_DIR, name));
      if (!doc) continue;
      const outputDir =
        doc.output_dir != null
          ? path.resolve(String(doc.output_dir))
          : doc.output_dir_relative && doc.project_root
            ? path.resolve(String(doc.project_root), String(doc.output_dir_relative))
            : null;
      if (!outputDir) continue;
      out.push({
        runId,
        outputDir,
        projectRoot:
          doc.project_root != null ? path.resolve(String(doc.project_root)) : null,
      });
    }
  } catch {
    /* */
  }
  return out;
}

/**
 * @param {import("./queue-store").Job} job
 */
function jobIsRunExecute(job) {
  const meta =
    job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
      ? job.metadata
      : {};
  const kind = String(meta.jobKind || meta.job_kind || "");
  return kind === JOB_KIND_RUN_EXECUTE || Boolean(meta.executionRunId);
}

/**
 * @param {import("./queue-store").Job} job
 */
function resolveRunIdFromJob(job) {
  const meta =
    job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
      ? job.metadata
      : {};
  return String(meta.executionRunId || meta.runId || job.runId || "").trim() || null;
}

/**
 * @param {string} runId
 * @param {import("./queue-store").Job[]} jobs
 */
function findBestJobForRun(runId, jobs) {
  const rid = String(runId || "").trim();
  let active = null;
  let latest = null;
  for (const j of jobs) {
    if (!j || !jobIsRunExecute(j)) continue;
    const jr = resolveRunIdFromJob(j);
    if (jr !== rid) continue;
    if (ACTIVE_JOB_STATUSES.has(String(j.status || ""))) {
      active = j;
      break;
    }
    if (!latest || String(j.createdAt || "") > String(latest.createdAt || "")) {
      latest = j;
    }
  }
  return active || latest;
}

/**
 * @param {{
 *   runId: string,
 *   orchState: string|null,
 *   job: import("./queue-store").Job|null,
 *   bundle: ReturnType<typeof collectExecutionForRun> extends { ok: true, data: infer D } ? D : null,
 * }} input
 * @returns {{ status: RecoveryStatus, reasons: string[] }}
 */
function classifyRunRecovery(input) {
  /** @type {string[]} */
  const reasons = [];
  const orch = String(input.orchState || "").toLowerCase();
  const job = input.job;
  const bundle = input.bundle;
  const life = bundle?.summary?.lifecycle?.phase
    ? String(bundle.summary.lifecycle.phase)
    : null;

  const jobActive =
    job != null && ACTIVE_JOB_STATUSES.has(String(job.status || ""));
  const orchActive = ACTIVE_ORCH_STATES.has(orch);
  const lifeTerminal = life != null && TERMINAL_LIFECYCLE.has(life);

  if (!orchActive && !jobActive) {
    return { status: null, reasons: [] };
  }

  if (job?.recovery_reason) {
    reasons.push(String(job.recovery_reason));
  }

  if (orchActive && !jobActive) {
    if (lifeTerminal) {
      reasons.push("orchestration_active_artifacts_terminal");
      return { status: "orphaned", reasons };
    }
    reasons.push("orchestration_active_without_job");
    return { status: "stale", reasons };
  }

  if (
    (life === "execution_running" || orch === "execution_running") &&
    !jobActive
  ) {
    reasons.push("execution_running_without_worker");
    return { status: "stale", reasons };
  }

  const corr = bundle?.summary?.correction;
  if (
    corr &&
    (corr.status === "active" || corr.status === "awaiting_review") &&
    life !== "correction_running"
  ) {
    reasons.push("correction_active_lifecycle_mismatch");
  }

  const retry = bundle?.summary?.retry;
  if (retry?.active && bundle?.subtasks) {
    const anyRetrying = bundle.subtasks.some((s) => s.state === "retrying");
    if (!anyRetrying) reasons.push("retry_active_without_retrying_subtask");
  }

  const review = bundle?.summary?.review;
  if (review?.status === "pending" && bundle?.subtasks) {
    const anyReview = bundle.subtasks.some((s) => s.state === "reviewing");
    if (!anyReview && life !== "review_running") {
      reasons.push("review_pending_without_reviewing_subtask");
    }
  }

  if (reasons.length > 0 && !reasons.some((r) => r.startsWith("orchestration"))) {
    return { status: "stale", reasons };
  }

  if (jobActive && !orchActive) {
    reasons.push("job_active_orchestration_missing");
    return { status: "recovery_pending", reasons };
  }

  if (reasons.length === 0 && (orchActive || jobActive)) {
    return { status: "recovered", reasons: ["runtime_rehydrated"] };
  }

  return { status: "recovered", reasons };
}

/**
 * @param {string} outputDir
 * @param {RecoveryStatus} status
 * @param {string[]} reasons
 */
function persistRecoveryMarkers(outputDir, status, reasons) {
  const fp = path.join(outputDir, "orchestration-state.json");
  const prev = safeReadJson(fp) || {};
  const next = {
    schema_version: "1.0.0",
    ...prev,
    recovery_status: status,
    recovery_reasons: reasons,
    recovery_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(fp, JSON.stringify(next, null, 2), "utf-8");

  const ctxPath = path.join(outputDir, "run-context.json");
  const ctx = safeReadJson(ctxPath) || {};
  const orch =
    ctx.orchestration && typeof ctx.orchestration === "object"
      ? { ...ctx.orchestration }
      : {};
  orch.recovery_status = status;
  orch.recovery_reasons = reasons;
  ctx.orchestration = orch;
  ctx.updated_at = new Date().toISOString();
  fs.writeFileSync(ctxPath, JSON.stringify(ctx, null, 2), "utf-8");
}

/**
 * @param {RecoveryStatus} status
 * @param {string} runId
 * @param {import("./queue-store").Job|null} job
 * @param {string[]} reasons
 */
function emitRecoveryStatusEvent(status, runId, job, reasons) {
  if (!status) return;
  const typeMap = {
    recovered: "runtime_recovered",
    stale: "runtime_stale",
    orphaned: "runtime_orphaned",
    recovery_pending: "recovery_started",
    recovery_failed: "recovery_failed",
  };
  const type = typeMap[status];
  if (!type) return;
  try {
    emitRuntimeEvent({
      type,
      jobId: job?.id ?? null,
      runId,
      projectId: job?.projectId ?? null,
      projectRoot: job?.projectRoot ?? null,
      data: {
        recoveryStatus: status,
        recoveryReasons: reasons,
        message: reasons[0] || status,
      },
    });
  } catch {
    /* */
  }
}

/**
 * @param {{ cap?: number, emitEvents?: boolean }} [opts]
 */
function rehydrateRuntimeOnBoot(opts = {}) {
  const cap = typeof opts.cap === "number" && opts.cap > 0 ? Math.floor(opts.cap) : 80;
  const emitEvents = opts.emitEvents !== false;

  /** @type {{ scanned: number, recovered: number, stale: number, orphaned: number, pending: number, failed: number, runs: object[] }} */
  const summary = {
    scanned: 0,
    recovered: 0,
    stale: 0,
    orphaned: 0,
    pending: 0,
    failed: 0,
    runs: [],
  };

  if (emitEvents) {
    try {
      emitRuntimeEvent({
        type: "recovery_started",
        jobId: null,
        runId: null,
        data: { source: "daemon_boot" },
      });
    } catch {
      /* */
    }
  }

  const jobs = loadQueueUnsafe().jobs;
  /** @type {Set<string>} */
  const seen = new Set();

  const processRun = (runId, jobHint) => {
    if (seen.has(runId) || summary.runs.length >= cap) return;
    seen.add(runId);
    summary.scanned += 1;

    let outputDir;
    try {
      outputDir = path.resolve(resolveOutputDir(runId, { warnLegacy: false }));
    } catch {
      summary.failed += 1;
      return;
    }

    const job = jobHint || findBestJobForRun(runId, jobs);
    const { file: fileBefore } = readOrchestrationFromDisk(outputDir);

    try {
      syncOrchestrationFromArtifacts(runId, job, {
        workerId:
          fileBefore?.worker_id != null ? String(fileBefore.worker_id) : null,
        rehydrate: true,
      });
    } catch {
      summary.failed += 1;
    }

    const { file } = readOrchestrationFromDisk(outputDir);
    const orchState = file && file.state != null ? String(file.state) : null;
    const execBundle = collectExecutionForRun(runId);
    const bundle = execBundle.ok ? execBundle.data : null;

    const { status, reasons } = classifyRunRecovery({
      runId,
      orchState,
      job,
      bundle,
    });

    if (status) {
      persistRecoveryMarkers(outputDir, status, reasons);
      if (status === "recovered") summary.recovered += 1;
      else if (status === "stale") summary.stale += 1;
      else if (status === "orphaned") summary.orphaned += 1;
      else if (status === "recovery_pending") summary.pending += 1;
      else if (status === "recovery_failed") summary.failed += 1;

      if (emitEvents) emitRecoveryStatusEvent(status, runId, job, reasons);
    }

    const boot = collectOrchestrationBootstrap(runId, outputDir);
    summary.runs.push({
      runId,
      jobId: boot.jobId,
      orchestrationState: boot.orchestrationState,
      executionState: boot.executionState,
      recoveryStatus: status,
      recoveryReasons: reasons,
    });
  };

  for (const j of jobs) {
    if (!jobIsRunExecute(j)) continue;
    const rid = resolveRunIdFromJob(j);
    if (!rid) continue;
    const st = String(j.status || "");
    if (!ACTIVE_JOB_STATUSES.has(st) && st !== "failed" && st !== "completed") continue;
    processRun(rid, j);
  }

  for (const entry of listRunIndexEntries()) {
    if (seen.has(entry.runId)) continue;
    const { file } = readOrchestrationFromDisk(entry.outputDir);
    const st = file && file.state != null ? String(file.state) : "";
    if (!ACTIVE_ORCH_STATES.has(st)) continue;
    processRun(entry.runId, findBestJobForRun(entry.runId, jobs));
  }

  if (emitEvents) {
    try {
      emitRuntimeEvent({
        type: "recovery_completed",
        jobId: null,
        runId: null,
        data: {
          scanned: summary.scanned,
          recovered: summary.recovered,
          stale: summary.stale,
          orphaned: summary.orphaned,
          pending: summary.pending,
        },
      });
      emitRuntimeEvent({
        type: "runtime_recovered",
        jobId: null,
        runId: null,
        data: {
          message: "Runtime rehidratado após arranque do daemon.",
          ...summary,
        },
      });
    } catch {
      /* */
    }
  }

  return summary;
}

/**
 * Snapshot para UI / runtime API.
 */
function buildRuntimeRecoverySnapshot() {
  const jobs = loadQueueUnsafe().jobs;
  /** @type {object[]} */
  const activeRuns = [];
  const seen = new Set();

  const pushRun = (runId) => {
    if (seen.has(runId)) return;
    seen.add(runId);
    let outputDir;
    try {
      outputDir = path.resolve(resolveOutputDir(runId, { warnLegacy: false }));
    } catch {
      return;
    }
    const { file, ctxOrch } = readOrchestrationFromDisk(outputDir);
    const orchState = String(
      (file && file.state) || (ctxOrch && ctxOrch.state) || "",
    );
    if (!ACTIVE_ORCH_STATES.has(orchState) && !findActiveExecutionJob(runId, jobs)) {
      const rec =
        file && file.recovery_status != null ? String(file.recovery_status) : null;
      if (rec !== "stale" && rec !== "orphaned") return;
    }
    const boot = collectOrchestrationBootstrap(runId, outputDir);
    const job = findBestJobForRun(runId, jobs);
    activeRuns.push({
      runId,
      jobId: boot.jobId,
      orchestrationState: boot.orchestrationState,
      executionState: boot.executionState,
      recoveryStatus:
        file && file.recovery_status != null
          ? String(file.recovery_status)
          : ctxOrch && ctxOrch.recovery_status != null
            ? String(ctxOrch.recovery_status)
            : null,
      recoveryReasons:
        file && Array.isArray(file.recovery_reasons)
          ? file.recovery_reasons.map(String)
          : [],
      jobStatus: job ? String(job.status || "") : null,
    });
  };

  for (const j of jobs) {
    if (!jobIsRunExecute(j)) continue;
    const rid = resolveRunIdFromJob(j);
    if (rid && ACTIVE_JOB_STATUSES.has(String(j.status || ""))) pushRun(rid);
  }

  for (const entry of listRunIndexEntries()) {
    const { file } = readOrchestrationFromDisk(entry.outputDir);
    const st = file && file.state != null ? String(file.state) : "";
    if (ACTIVE_ORCH_STATES.has(st)) pushRun(entry.runId);
  }

  return {
    activeRuns,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  rehydrateRuntimeOnBoot,
  buildRuntimeRecoverySnapshot,
  classifyRunRecovery,
  listRunIndexEntries,
  ACTIVE_ORCH_STATES,
};
