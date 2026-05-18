"use strict";

const path = require("path");

const { resolveOutputDir } = require("../../../core/run-resolver");
const { collectExecutionForRun } = require("./run-execution");
const { emitRuntimeEvent } = require("./runtime-events");
const {
  mapExecutionState,
  readOrchestrationFromDisk,
} = require("./run-execute-api");
const { runPostReviewApprovedGitCommit } = require("./run-git-commit-after-review");

const ORCH_SYNC_INTERVAL_MS = Number(
  process.env.SETUP_BOSS_ORCH_SYNC_MS || 6000,
);

/** @typedef {{
 *   lifecycle_phase: string,
 *   review_status: string,
 *   correction_status: string,
 *   correction_generation: number,
 *   retry_active: boolean,
 *   recovery_status: string,
 * }} EmittedSnapshot */

/**
 * @param {string} lifecyclePhase
 */
function lifecycleToOrchestrationStates(lifecyclePhase) {
  const phase = String(lifecyclePhase || "").toLowerCase();
  /** @type {string} */
  let orchestrationState = "execution_running";
  if (phase === "execution_completed") orchestrationState = "execution_completed";
  else if (phase === "execution_failed") orchestrationState = "execution_failed";
  else if (phase === "execution_blocked") orchestrationState = "execution_blocked";
  else if (phase === "review_running") orchestrationState = "execution_reviewing";
  else if (phase === "correction_running") orchestrationState = "execution_correcting";
  else if (phase === "recovery_running") orchestrationState = "execution_recovering";
  else if (phase === "retry_running") orchestrationState = "execution_running";
  else if (phase === "execution_running") orchestrationState = "execution_running";
  else if (phase === "execution_pending") orchestrationState = "execution_starting";

  const executionState = mapExecutionState(orchestrationState, phase);
  return { orchestrationState, executionState, lifecyclePhase: phase };
}

/**
 * @param {import("./run-execution").collectExecutionBundle extends Function ? ReturnType<import("./run-execution").collectExecutionBundle>['data'] : never} bundle
 * @returns {EmittedSnapshot}
 */
function snapshotFromBundle(bundle) {
  if (!bundle || !bundle.summary) {
    return {
      lifecycle_phase: "execution_pending",
      review_status: "none",
      correction_status: "idle",
      correction_generation: 0,
      retry_active: false,
      recovery_status: "none",
    };
  }
  const sum = bundle.summary;
  return {
    lifecycle_phase: String(sum.lifecycle?.phase || "execution_pending"),
    review_status: String(sum.review?.status || "none"),
    correction_status: String(sum.correction?.status || "idle"),
    correction_generation:
      typeof sum.correction?.generation === "number" ? sum.correction.generation : 0,
    retry_active: Boolean(sum.retry?.active),
    recovery_status: String(sum.recovery?.status || "none"),
  };
}

/**
 * @param {EmittedSnapshot|null|undefined} prev
 * @param {EmittedSnapshot} next
 * @param {{ terminal?: boolean, jobFailed?: boolean }} opts
 * @returns {string[]}
 */
function diffEmitTypes(prev, next, opts = {}) {
  /** @type {string[]} */
  const out = [];
  const p = prev || null;

  if (!p || (p.lifecycle_phase !== "execution_running" && next.lifecycle_phase === "execution_running")) {
    if (next.lifecycle_phase === "execution_running") out.push("execution_started");
  }

  if (next.lifecycle_phase === "review_running" && (!p || p.lifecycle_phase !== "review_running")) {
    out.push("review_started");
  }

  if (next.review_status === "rejected" && (!p || p.review_status !== "rejected")) {
    out.push("review_rejected");
  }

  if (
    next.review_status === "approved" &&
    (!p || p.review_status !== "approved") &&
    next.lifecycle_phase !== "execution_completed"
  ) {
    out.push("review_completed");
  }

  const corrActive =
    next.correction_status === "active" || next.correction_status === "awaiting_review";
  const prevCorrActive =
    p &&
    (p.correction_status === "active" || p.correction_status === "awaiting_review");
  if (
    corrActive &&
    (!p ||
      !prevCorrActive ||
      next.correction_generation > (p.correction_generation || 0))
  ) {
    out.push("correction_started");
  }

  if (
    next.correction_status === "closed" &&
    p &&
    p.correction_status !== "closed" &&
    (p.correction_status === "active" || p.correction_status === "awaiting_review")
  ) {
    out.push("correction_completed");
  }

  if (next.retry_active && (!p || !p.retry_active)) {
    out.push("retry_started");
  }

  if (next.lifecycle_phase === "execution_completed" && (!p || p.lifecycle_phase !== "execution_completed")) {
    out.push("execution_completed");
  }

  if (
    (next.lifecycle_phase === "execution_failed" || opts.jobFailed === true) &&
    (!p || p.lifecycle_phase !== "execution_failed")
  ) {
    out.push("execution_failed");
  }

  if (
    next.recovery_status === "completed" &&
    (!p || p.recovery_status !== "completed")
  ) {
    out.push("execution_recovered");
  }

  if (opts.terminal && !out.includes("execution_completed") && !out.includes("execution_failed")) {
    if (next.lifecycle_phase === "execution_completed") out.push("execution_completed");
    else if (next.lifecycle_phase === "execution_failed" || opts.jobFailed) {
      out.push("execution_failed");
    }
  }

  return [...new Set(out)];
}

/**
 * @param {string} outputDir
 * @param {Record<string, unknown>} patch
 */
function writeOrchestrationStateFile(outputDir, patch) {
  const fs = require("fs");
  const fp = path.join(outputDir, "orchestration-state.json");
  /** @type {Record<string, unknown>} */
  let prev = {};
  try {
    if (fs.existsSync(fp)) {
      const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
      if (j && typeof j === "object" && !Array.isArray(j)) prev = j;
    }
  } catch {
    /* */
  }
  const next = {
    schema_version: "1.0.0",
    ...prev,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(fp, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

/**
 * @param {string} outputDir
 * @param {Record<string, unknown>} orchPatch
 */
function mergeOrchestrationIntoRunContext(outputDir, orchPatch) {
  const fs = require("fs");
  const ctxPath = path.join(outputDir, "run-context.json");
  /** @type {Record<string, unknown>} */
  let doc = {};
  try {
    if (fs.existsSync(ctxPath)) {
      const j = JSON.parse(fs.readFileSync(ctxPath, "utf-8"));
      if (j && typeof j === "object" && !Array.isArray(j)) doc = j;
    }
  } catch {
    /* */
  }
  const orch =
    doc.orchestration && typeof doc.orchestration === "object" && !Array.isArray(doc.orchestration)
      ? { .../** @type {Record<string, unknown>} */ (doc.orchestration) }
      : {};
  doc.orchestration = { ...orch, ...orchPatch };
  if (!doc.phase4 || typeof doc.phase4 !== "object") {
    doc.phase4 = { status: "starting" };
  } else {
    const p4 = /** @type {Record<string, unknown>} */ (doc.phase4);
    const st = String(p4.status || "");
    if (st === "idle" || st === "starting") {
      p4.status =
        orchPatch.state === "execution_completed"
          ? "completed"
          : orchPatch.state === "execution_failed"
            ? "failed"
            : "running";
    } else if (
      orchPatch.state === "execution_completed" ||
      orchPatch.state === "execution_failed"
    ) {
      p4.status =
        orchPatch.state === "execution_completed" ? "completed" : "failed";
    }
    doc.phase4 = p4;
  }
  doc.updated_at = new Date().toISOString();
  fs.writeFileSync(ctxPath, JSON.stringify(doc, null, 2), "utf-8");
}

/**
 * @param {string} runId
 * @param {import("./queue-store").Job} job
 * @param {{
 *   terminal?: boolean,
 *   jobExitCode?: number|null,
 *   workerId?: string|null,
 *   rehydrate?: boolean,
 * }} [opts]
 */
function syncOrchestrationFromArtifacts(runId, job, opts = {}) {
  const rehydrate = opts.rehydrate === true;
  const rid = String(runId || "").trim();
  if (!rid) return { ok: false, reason: "run_id_missing" };

  let outputDir;
  try {
    outputDir = path.resolve(resolveOutputDir(rid, { warnLegacy: false }));
  } catch {
    return { ok: false, reason: "output_unavailable" };
  }

  const terminal = opts.terminal === true;
  const jobFailed =
    opts.jobExitCode != null &&
    Number.isFinite(Number(opts.jobExitCode)) &&
    Number(opts.jobExitCode) !== 0;

  const execBundle = collectExecutionForRun(rid);
  const bundle = execBundle.ok ? execBundle.data : null;
  const snap = snapshotFromBundle(bundle);

  if (jobFailed && snap.lifecycle_phase !== "execution_completed") {
    snap.lifecycle_phase = "execution_failed";
  }

  const { orchestrationState, executionState, lifecyclePhase } =
    lifecycleToOrchestrationStates(snap.lifecycle_phase);

  const { file } = readOrchestrationFromDisk(outputDir);
  const prevEmitted =
    file &&
    file.last_emitted &&
    typeof file.last_emitted === "object" &&
    !Array.isArray(file.last_emitted)
      ? /** @type {EmittedSnapshot} */ (file.last_emitted)
      : null;

  const emitTypes = rehydrate
    ? []
    : diffEmitTypes(prevEmitted, snap, {
        terminal,
        jobFailed,
      });

  const now = new Date().toISOString();
  const workerId =
    opts.workerId != null
      ? String(opts.workerId)
      : file && file.worker_id != null
        ? String(file.worker_id)
        : null;

  writeOrchestrationStateFile(outputDir, {
    state: orchestrationState,
    execution_state: executionState,
    lifecycle_phase: lifecyclePhase,
    job_id: job && job.id ? String(job.id) : file && file.job_id != null ? String(file.job_id) : null,
    worker_id: workerId,
    last_emitted: snap,
    last_sync_at: now,
    ...(terminal
      ? {
          finished_at: now,
          terminal: true,
          exit_code:
            opts.jobExitCode != null && Number.isFinite(Number(opts.jobExitCode))
              ? Number(opts.jobExitCode)
              : null,
        }
      : {}),
  });

  mergeOrchestrationIntoRunContext(outputDir, {
    state: orchestrationState,
    execution_state: executionState,
    lifecycle_phase: lifecyclePhase,
    job_id: job && job.id ? String(job.id) : null,
    worker_id: workerId,
    ...(terminal ? { finished_at: now } : {}),
  });

  const jobId = job && job.id ? String(job.id) : null;
  if (emitTypes.includes("review_completed")) {
    setImmediate(() => {
      runPostReviewApprovedGitCommit(rid, outputDir, job).catch(() => {
        /* não fatal */
      });
    });
  }

  for (const type of emitTypes) {
    try {
      emitRuntimeEvent({
        type,
        jobId,
        runId: rid,
        projectId: job && job.projectId ? String(job.projectId) : null,
        projectRoot: job && job.projectRoot ? String(job.projectRoot) : null,
        data: {
          orchestrationState,
          executionState,
          lifecyclePhase,
          message: orchestrationEventMessage(type, snap),
          reviewStatus: snap.review_status,
          correctionGeneration: snap.correction_generation,
          retryActive: snap.retry_active,
          terminal,
        },
      });
    } catch {
      /* */
    }
  }

  if (terminal && job && job.id) {
    try {
      const { updateJob } = require("./queue-store");
      const uiState =
        orchestrationState === "execution_completed"
          ? "success"
          : orchestrationState === "execution_failed"
            ? "failed"
            : "completed";
      updateJob(null, job.id, (j) => ({
        ...j,
        metadata: {
          ...(j.metadata && typeof j.metadata === "object" ? j.metadata : {}),
          orchestrationState,
          executionState,
          uiPhase: "execution",
          uiState,
          orchestrationSyncedAt: now,
        },
      }));
    } catch {
      /* */
    }
  }

  return {
    ok: true,
    orchestrationState,
    executionState,
    lifecyclePhase,
    emitted: emitTypes,
  };
}

/**
 * @param {string} type
 * @param {EmittedSnapshot} snap
 */
function orchestrationEventMessage(type, snap) {
  switch (type) {
    case "execution_started":
      return "Pipeline de execução activo.";
    case "review_started":
      return "Review de execução iniciado.";
    case "review_rejected":
      return "Review rejeitado — correcção necessária.";
    case "review_completed":
      return "Review aprovado.";
    case "correction_started":
      return `Correcção g${snap.correction_generation || 1} iniciada.`;
    case "correction_completed":
      return "Correcção concluída.";
    case "retry_started":
      return "Retry de subtask iniciado.";
    case "execution_completed":
      return "Execução concluída com sucesso.";
    case "execution_failed":
      return "Execução terminou em falha.";
    case "execution_recovered":
      return "Execução recuperada após incidente.";
    default:
      return type.replace(/_/g, " ");
  }
}

module.exports = {
  ORCH_SYNC_INTERVAL_MS,
  syncOrchestrationFromArtifacts,
  lifecycleToOrchestrationStates,
  snapshotFromBundle,
  diffEmitTypes,
  orchestrationEventMessage,
};
