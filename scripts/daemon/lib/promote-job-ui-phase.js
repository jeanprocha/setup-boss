"use strict";

const { loadQueueUnsafe, updateJob } = require("./queue-store");

const JOB_KIND_RUN_EXECUTE = "run_execute";

/** Ordem monotónica — só promove para cima. */
const UI_PHASE_RANK = {
  intake: 0,
  queue: 0,
  pending: 0,
  clarify: 1,
  clarification: 1,
  strategy: 2,
  execution: 3,
  done: 4,
  failed: 4,
  cancelled: 4,
};

/**
 * @param {string|null|undefined} phase
 * @returns {number}
 */
function uiPhaseRank(phase) {
  const p = String(phase || "").trim().toLowerCase();
  if (!p) return -1;
  return Object.prototype.hasOwnProperty.call(UI_PHASE_RANK, p)
    ? UI_PHASE_RANK[p]
    : -1;
}

/**
 * Job de intake/corrida principal (não `run_execute`).
 *
 * @param {{ jobs?: object[] }} queue
 * @param {string} runId
 * @returns {object|null}
 */
function findPrimaryIntakeJobForRun(queue, runId) {
  const rid = String(runId || "").trim();
  if (!rid) return null;

  /** @type {object|null} */
  let best = null;
  for (const j of queue.jobs || []) {
    if (!j || String(j.runId || "") !== rid) continue;
    const meta =
      j.metadata && typeof j.metadata === "object" && !Array.isArray(j.metadata)
        ? j.metadata
        : {};
    if (String(meta.jobKind || "") === JOB_KIND_RUN_EXECUTE) continue;
    if (String(j.taskArg || "").startsWith("execute:")) continue;
    if (!best) {
      best = j;
      continue;
    }
    const created = Date.parse(j.createdAt || "") || 0;
    const bestCreated = Date.parse(best.createdAt || "") || 0;
    if (created >= bestCreated) best = j;
  }
  return best;
}

/**
 * Promove `metadata.uiPhase` do job de intake quando o pipeline real avançou.
 *
 * @param {string} runId
 * @param {"strategy"|"execution"} targetUiPhase
 * @param {{ uiState?: string|null, jobId?: string|null }} [opts]
 * @returns {{ ok: boolean, skipped?: boolean, promoted?: boolean, reason?: string, from?: string|null, to?: string, jobId?: string }}
 */
function promoteJobUiPhaseForRun(runId, targetUiPhase, opts = {}) {
  const target = String(targetUiPhase || "").trim().toLowerCase();
  const targetRank = uiPhaseRank(target);
  if (targetRank < 0) {
    return { ok: false, skipped: true, reason: "invalid_target" };
  }

  const queue = loadQueueUnsafe();
  const job =
    opts.jobId != null
      ? (queue.jobs || []).find((j) => j && j.id === opts.jobId) ||
        findPrimaryIntakeJobForRun(queue, runId)
      : findPrimaryIntakeJobForRun(queue, runId);

  if (!job) {
    return { ok: true, skipped: true, reason: "no_job" };
  }

  const meta =
    job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
      ? job.metadata
      : {};
  const current = String(meta.uiPhase || meta.ui_phase || "").trim().toLowerCase();
  const currentRank = uiPhaseRank(current);

  if (currentRank >= 0 && targetRank <= currentRank) {
    return {
      ok: true,
      skipped: true,
      reason: "already_at_or_beyond",
      from: current || null,
      to: target,
      jobId: job.id,
    };
  }

  updateJob(queue, job.id, (j) => ({
    ...j,
    metadata: {
      ...(j.metadata && typeof j.metadata === "object" && !Array.isArray(j.metadata)
        ? j.metadata
        : {}),
      uiPhase: target,
      ...(opts.uiState != null && String(opts.uiState).trim()
        ? { uiState: String(opts.uiState).trim() }
        : {}),
    },
  }));

  return {
    ok: true,
    promoted: true,
    from: current || null,
    to: target,
    jobId: job.id,
  };
}

module.exports = {
  promoteJobUiPhaseForRun,
  findPrimaryIntakeJobForRun,
  uiPhaseRank,
};
