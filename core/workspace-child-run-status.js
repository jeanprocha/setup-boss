"use strict";

const fs = require("fs");
const path = require("path");
const { resolveOutputDir, resolveRunIndexPath } = require("./run-resolver");
const { loadQueueUnsafe } = require("../scripts/daemon/lib/queue-store");
const { collectClarificationForRun } = require("../scripts/daemon/lib/run-clarification");
const { collectExecutionForRun } = require("../scripts/daemon/lib/run-execution");

/**
 * @typedef {"running"|"waiting_user_action"|"failed"|"completed"} ChildRunOrchestrationPhase
 * @typedef {{ phase: ChildRunOrchestrationPhase, reason: string }} ChildRunOrchestrationStatus
 */

/**
 * @param {string} runId
 * @param {Array<{ runId?: string, status?: string, metadata?: Record<string, unknown> }>} jobs
 */
function findJobForRunId(runId, jobs) {
  const rid = String(runId || "").trim();
  if (!rid) return null;
  let latest = null;
  for (const j of jobs || []) {
    if (!j) continue;
    const meta =
      j.metadata && typeof j.metadata === "object" && !Array.isArray(j.metadata)
        ? j.metadata
        : {};
    const jr = String(j.runId || meta.runId || meta.executionRunId || "").trim();
    if (jr !== rid) continue;
    if (!latest || String(j.createdAt || "") > String(latest.createdAt || "")) {
      latest = j;
    }
  }
  return latest;
}

/**
 * @param {string} outputDir
 */
function readOrchestrationStatePhase(outputDir) {
  try {
    const p = path.join(outputDir, "orchestration-state.json");
    if (!fs.existsSync(p)) return null;
    const doc = JSON.parse(fs.readFileSync(p, "utf-8"));
    return doc && doc.state != null ? String(doc.state).trim().toLowerCase() : null;
  } catch (_) {
    return null;
  }
}

/**
 * Resolve fase agregada do run filho para o orquestrador workspace (MVP).
 * @param {string} runId
 * @param {{ jobs?: Array<object>|null }} [opts]
 * @returns {ChildRunOrchestrationStatus}
 */
function resolveChildRunOrchestrationStatus(runId, opts = {}) {
  const rid = String(runId || "").trim();
  if (!rid) return { phase: "failed", reason: "run_id_missing" };

  const jobs = Array.isArray(opts.jobs) ? opts.jobs : loadQueueUnsafe().jobs || [];

  let outputDir = null;
  try {
    outputDir = resolveOutputDir(rid, { warnLegacy: false });
  } catch (_) {
    const jobOnly = findJobForRunId(rid, jobs);
    if (jobOnly) {
      const st = String(jobOnly.status || "").toLowerCase();
      if (st === "failed" || st === "cancelled") {
        return { phase: "failed", reason: `job_${st}` };
      }
    }
    return { phase: "running", reason: "output_not_ready" };
  }

  const exec = collectExecutionForRun(rid);
  if (exec.ok && exec.data && exec.data.summary) {
    const life = String(exec.data.summary.lifecycle?.phase || "").toLowerCase();
    const review = String(exec.data.summary.review?.status || "").toLowerCase();
    const health = String(exec.data.summary.health || "").toLowerCase();

    if (life === "execution_failed" || health === "failed") {
      return { phase: "failed", reason: life || "execution_failed" };
    }
    if (review === "rejected") {
      return { phase: "failed", reason: "review_rejected" };
    }
    if (life === "execution_completed") {
      return { phase: "completed", reason: "execution_completed" };
    }
    if (life === "execution_blocked") {
      return { phase: "waiting_user_action", reason: "execution_blocked" };
    }
    if (
      life === "review_running" &&
      (review === "pending" || review === "awaiting")
    ) {
      return { phase: "waiting_user_action", reason: "review_pending" };
    }
    if (
      [
        "execution_running",
        "review_running",
        "correction_running",
        "retry_running",
        "recovery_running",
        "rollback_running",
      ].includes(life)
    ) {
      return { phase: "running", reason: life };
    }
  }

  const orchPhase = readOrchestrationStatePhase(outputDir);
  if (orchPhase === "execution_completed" || orchPhase === "completed") {
    return { phase: "completed", reason: orchPhase };
  }
  if (orchPhase === "execution_failed" || orchPhase === "failed") {
    return { phase: "failed", reason: orchPhase };
  }

  const clar = collectClarificationForRun(rid);
  if (clar.ok && clar.data && clar.data.session) {
    const rp = String(clar.data.session.runtimePhase || "").toLowerCase();
    if (rp === "rejected") return { phase: "failed", reason: "clarification_rejected" };
    if (rp === "awaiting_approval" || rp === "waiting_answers") {
      return { phase: "waiting_user_action", reason: rp };
    }
  }

  const job = findJobForRunId(rid, jobs);
  if (job) {
    const jst = String(job.status || "").toLowerCase();
    if (jst === "failed" || jst === "cancelled") {
      return { phase: "failed", reason: `job_${jst}` };
    }
    const meta =
      job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
        ? job.metadata
        : {};
    const ui = meta.uiState != null ? String(meta.uiState).toLowerCase() : "";
    if (ui === "failed") return { phase: "failed", reason: ui };
    if (ui === "success") return { phase: "completed", reason: ui };
    if (ui.includes("waiting")) {
      return { phase: "waiting_user_action", reason: ui };
    }
    const initial = meta.initialState != null ? String(meta.initialState).toLowerCase() : "";
    if (initial === "failed") return { phase: "failed", reason: initial };
  }

  const idxPath = resolveRunIndexPath(rid);
  if (fs.existsSync(idxPath)) {
    return { phase: "running", reason: "in_progress" };
  }

  return { phase: "running", reason: "unknown" };
}

module.exports = {
  resolveChildRunOrchestrationStatus,
  findJobForRunId,
};
