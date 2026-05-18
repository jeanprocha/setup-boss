"use strict";

const fs = require("fs");
const path = require("path");

const { readJsonObject } = require("./build-execution-session");
const { subtaskExecutionFilename, orderedSubtaskRows } = require("./build-subtask-execution-state");
const { runSingleSubtaskExecutorMvp, executionResultFilename } = require("./run-subtask-executor");
const { runPatchValidationPhase } = require("./validate-execution-patch");
const { runExecutionReviewPhase } = require("./run-execution-review");
const { architectHandoffFilename } = require("./build-architect-handoff");
const { tryAutoRollbackAfterFailure } = require("./manage-execution-rollback");

const CORRECTION_PHASE = "4.7";
const MAX_ATTEMPTS = 2;

/**
 * @param {string} subtaskId
 */
function correctionLoopFilename(subtaskId) {
  const id = String(subtaskId || "").trim();
  return /^\d{3}$/.test(id) ? `${id}-correction-loop.json` : "";
}

/**
 * @param {string} execDir
 * @param {string} subtaskId
 * @param {Record<string, unknown>} patch
 */
function mergeExecutionSubtask(execDir, subtaskId, patch) {
  const fn = subtaskExecutionFilename(subtaskId);
  if (!fn) return;
  const fp = path.join(execDir, "subtasks", fn);
  const doc = readJsonObject(fp);
  if (!doc) return;
  const d = /** @type {Record<string, unknown>} */ (doc);
  Object.assign(d, patch);
  fs.writeFileSync(fp, JSON.stringify(d, null, 2), "utf-8");
}

/**
 * @param {Record<string, unknown>|null} loop
 * @returns {boolean}
 */
function isValidCompletedCorrection(loop) {
  if (!loop || typeof loop !== "object" || Array.isArray(loop)) return false;
  const l = /** @type {Record<string, unknown>} */ (loop);
  return (
    Number(l.version) === 1 &&
    String(l.phase) === CORRECTION_PHASE &&
    String(l.status) === "correction_completed" &&
    String(l.correction_state) === "retry_completed" &&
    String(l.resulting_review_state) === "approved"
  );
}

/**
 * @param {Record<string, unknown>|null} doc
 * @returns {boolean}
 */
function wasRejectedForCorrection(doc) {
  if (!doc) return false;
  if (String(doc.execution_state || "") !== "review_failed") return false;
  const rd =
    doc.review_decision && typeof doc.review_decision === "object" && !Array.isArray(doc.review_decision)
      ? /** @type {Record<string, unknown>} */ (doc.review_decision)
      : null;
  return rd ? String(rd.result || "") === "rejected" : false;
}

/**
 * @param {Record<string, unknown>|null} doc
 * @returns {boolean}
 */
function isBlockedReview(doc) {
  if (!doc) return false;
  const rd =
    doc.review_decision && typeof doc.review_decision === "object" && !Array.isArray(doc.review_decision)
      ? /** @type {Record<string, unknown>} */ (doc.review_decision)
      : null;
  return String(doc.execution_state || "") === "review_failed" && !!rd && String(rd.result || "") === "blocked";
}

/**
 * @param {Record<string, unknown>} doc
 * @returns {number}
 */
function getCorrectionAttempts(doc) {
  const n = Number(doc.correction_attempts);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/**
 * @param {string} resultsDir
 * @param {string} sid
 * @returns {Record<string, unknown>|null}
 */
function readCorrectionLoop(resultsDir, sid) {
  const fn = correctionLoopFilename(sid);
  if (!fn) return null;
  return readJsonObject(path.join(resultsDir, fn));
}

/**
 * @param {string} outputDirAbs
 * @param {{ orderDoc: Record<string, unknown> }} loaded
 * @param {boolean} force
 * @returns {boolean}
 */
function hasCorrectionWorkPending(outputDirAbs, loaded, force) {
  const execDir = path.join(outputDirAbs, "execution");
  const resultsDir = path.join(execDir, "results");
  const rows = orderedSubtaskRows(loaded.orderDoc);
  for (const row of rows) {
    const fn = subtaskExecutionFilename(row.subtask_id);
    if (!fn) continue;
    const doc = readJsonObject(path.join(execDir, "subtasks", fn));
    if (!doc) continue;
    if (!wasRejectedForCorrection(doc)) continue;
    const attempts = getCorrectionAttempts(doc);
    if (attempts >= MAX_ATTEMPTS) continue;
    const loop = readCorrectionLoop(resultsDir, row.subtask_id);
    if (!force && isValidCompletedCorrection(loop)) continue;
    return true;
  }
  return false;
}

/**
 * @param {string} resultsDir
 * @param {string} sid
 * @param {Record<string, unknown>} body
 */
function writeCorrectionLoop(resultsDir, sid, body) {
  const fn = correctionLoopFilename(sid);
  if (!fn) return;
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, fn), JSON.stringify(body, null, 2), "utf-8");
}

/**
 * @param {string} resultsDir
 * @param {string} sid
 * @param {() => string} iso
 */
function writeIdleCorrectionLoop(resultsDir, sid, iso) {
  const fn = correctionLoopFilename(sid);
  if (!fn) return;
  const p = path.join(resultsDir, fn);
  if (fs.existsSync(p)) return;
  const now = iso();
  writeCorrectionLoop(resultsDir, sid, {
    version: 1,
    phase: CORRECTION_PHASE,
    subtask_id: sid,
    status: "idle",
    correction_state: "none",
    attempt: 0,
    max_attempts: MAX_ATTEMPTS,
    requires_retry: false,
    retry_allowed: false,
    started_at: now,
    completed_at: now,
    source_review_state: "none",
    resulting_review_state: "none",
    correction_summary: "Correção não aplicável (sem ciclo de correction nesta subtask).",
    warnings: [],
    errors: [],
  });
}

/**
 * @param {string} outputDirAbs
 * @param {string} execDir
 * @param {string} resultsDir
 * @param {string} sid
 * @param {{ type: string, recorded_at: string, payload?: Record<string, unknown> }[]} events
 * @param {() => string} iso
 */
function runCorrectionCriticalRollback(outputDirAbs, execDir, resultsDir, sid, events, iso) {
  const rfn = executionResultFilename(sid);
  const res = rfn ? readJsonObject(path.join(resultsDir, rfn)) : null;
  const hfn = architectHandoffFilename(sid);
  const ho = hfn ? readJsonObject(path.join(execDir, "handoffs", hfn)) : null;
  const allowed =
    ho && Array.isArray(ho.allowed_files)
      ? ho.allowed_files.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/"))
      : [];
  const modified =
    res && Array.isArray(res.modified_files)
      ? res.modified_files.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/"))
      : [];
  tryAutoRollbackAfterFailure({
    outputDirAbs,
    execDir,
    subtaskId: sid,
    trigger: "correction_failed_critical",
    modified_files: modified,
    allowed_files: allowed,
    events,
    iso,
  });
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   execDir: string,
 *   loaded: { orderDoc: Record<string, unknown>, subtaskRels: string[] },
 *   force: boolean,
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 *   lifecycleCtx?: { outputDirAbs: string, loaded: { orderDoc: Record<string, unknown> } },
 * }} p
 * @returns {{
 *   artifacts: string[],
 *   corrected_subtasks: number,
 *   correction_failed_subtasks: number,
 *   retry_exhausted_subtasks: number,
 *   correction_attempts_total: number,
 *   last_executor_subtask: string|null,
 * }}
 */
function runCorrectionRuntimePhase(p) {
  const { outputDirAbs, execDir, loaded, force, events, iso } = p;
  const lc = p.lifecycleCtx;
  const resultsDir = path.join(execDir, "results");
  fs.mkdirSync(resultsDir, { recursive: true });

  const rows = orderedSubtaskRows(loaded.orderDoc);
  /** @type {string[]} */
  const artifacts = [];
  let corrected_subtasks = 0;
  let correction_failed_subtasks = 0;
  let retry_exhausted_subtasks = 0;
  let correction_attempts_total = 0;
  /** @type {string|null} */
  let last_executor_subtask = null;

  for (const row of rows) {
    const sid = row.subtask_id;
    const stPath = path.join(execDir, "subtasks", subtaskExecutionFilename(sid));
    let doc = readJsonObject(stPath);
    if (!doc) continue;

    if (String(doc.execution_state || "") === "review_completed" && String(doc.review_state || "") === "approved") {
      continue;
    }

    if (isBlockedReview(doc)) {
      continue;
    }

    if (!wasRejectedForCorrection(doc)) continue;

    const attemptsBefore = getCorrectionAttempts(doc);
    const loopPrev = readCorrectionLoop(resultsDir, sid);
    if (!force && isValidCompletedCorrection(loopPrev)) {
      continue;
    }

    if (attemptsBefore >= MAX_ATTEMPTS) {
      const now = iso();
      writeCorrectionLoop(resultsDir, sid, {
        version: 1,
        phase: CORRECTION_PHASE,
        subtask_id: sid,
        status: "retry_exhausted",
        correction_state: "retry_exhausted",
        attempt: attemptsBefore,
        max_attempts: MAX_ATTEMPTS,
        requires_retry: false,
        retry_allowed: false,
        started_at: loopPrev && typeof loopPrev.started_at === "string" ? String(loopPrev.started_at) : now,
        completed_at: now,
        source_review_state: "rejected",
        resulting_review_state: "rejected",
        correction_summary: "Limite de tentativas de correction atingido.",
        warnings: [],
        errors: [],
      });
      mergeExecutionSubtask(execDir, sid, {
        correction_state: "retry_exhausted",
        updated_at: now,
        phase: CORRECTION_PHASE,
      });
      if (lc && lc.loaded) {
        const { saveExecutionCheckpoint } = require("./manage-execution-lifecycle");
        saveExecutionCheckpoint({
          execDir,
          outputDirAbs,
          loaded: lc.loaded,
          subtaskId: sid,
          lifecycleState: "running",
          recoveryState: "post_correction_retry_exhausted",
          events,
          iso,
        });
      }
      events.push({
        type: "correction_retry_exhausted",
        recorded_at: iso(),
        payload: {
          subtask_id: sid,
          attempt: attemptsBefore,
          review_state: "rejected",
          correction_state: "retry_exhausted",
        },
      });
      const { tryApplyMiniActivityCorrectionFailed } = require("../../../core/update-execution-runtime-state");
      tryApplyMiniActivityCorrectionFailed(outputDirAbs, {
        subtaskId: sid,
        exhausted: true,
        reason: "correction_retry_exhausted",
      });
      runCorrectionCriticalRollback(outputDirAbs, execDir, resultsDir, sid, events, iso);
      retry_exhausted_subtasks += 1;
      artifacts.push(`${"execution/results"}/${correctionLoopFilename(sid)}`.replace(/\\/g, "/"));
      continue;
    }

    const nextAttempt = attemptsBefore + 1;
    const startedAt = iso();

    events.push({
      type: "correction_started",
      recorded_at: iso(),
      payload: {
        subtask_id: sid,
        attempt: nextAttempt,
        review_state: "rejected",
        correction_state: "correcting",
      },
    });

    const { tryApplyMiniActivityCorrectionStarted } = require("../../../core/update-execution-runtime-state");
    const rvFnPrev = `${"execution/results"}/${sid}-execution-review.json`;
    tryApplyMiniActivityCorrectionStarted(outputDirAbs, {
      subtaskId: sid,
      correctionRef: `${"execution/results"}/${correctionLoopFilename(sid)}`.replace(/\\/g, "/"),
      reviewArtifactRef: rvFnPrev.replace(/\\/g, "/"),
      reason: "correction_started",
    });

    mergeExecutionSubtask(execDir, sid, {
      status: "correcting",
      execution_state: "correcting",
      correction_state: "correcting",
      phase: CORRECTION_PHASE,
      updated_at: startedAt,
    });

    events.push({
      type: "correction_retry_started",
      recorded_at: iso(),
      payload: {
        subtask_id: sid,
        attempt: nextAttempt,
        review_state: "rejected",
        correction_state: "retrying",
      },
    });

    mergeExecutionSubtask(execDir, sid, {
      status: "retrying",
      execution_state: "retrying",
      correction_state: "retrying",
      correction_attempts: nextAttempt,
      updated_at: iso(),
    });

    correction_attempts_total += 1;

    mergeExecutionSubtask(execDir, sid, {
      status: "handoff_ready",
      execution_state: "handoff_ready",
      phase: "4.5",
      updated_at: iso(),
    });

    try {
      const ex = runSingleSubtaskExecutorMvp({
        outputDirAbs,
        execDir,
        loaded,
        force: false,
        events,
        iso,
        target_subtask_id: sid,
        lifecycleCtx: lc ? { loaded: lc.loaded } : undefined,
      });
      if (!ex.ran) {
        throw new Error("EXECUTOR_SKIPPED_OR_NOT_RUNNABLE");
      }
      if (ex.subtask_id) last_executor_subtask = ex.subtask_id;

      runPatchValidationPhase({
        execDir,
        loaded,
        force: false,
        events,
        iso,
        lifecycleCtx: lc,
      });

      runExecutionReviewPhase({
        execDir,
        loaded,
        force: false,
        events,
        iso,
        lifecycleCtx: lc,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const now = iso();
      writeCorrectionLoop(resultsDir, sid, {
        version: 1,
        phase: CORRECTION_PHASE,
        subtask_id: sid,
        status: "correction_failed",
        correction_state: "correction_failed",
        attempt: nextAttempt,
        max_attempts: MAX_ATTEMPTS,
        requires_retry: nextAttempt < MAX_ATTEMPTS,
        retry_allowed: nextAttempt < MAX_ATTEMPTS,
        started_at: startedAt,
        completed_at: now,
        source_review_state: "rejected",
        resulting_review_state: "rejected",
        correction_summary: `Falha no pipeline de correction: ${msg}`,
        warnings: [],
        errors: [msg],
      });
      mergeExecutionSubtask(execDir, sid, {
        correction_state: "correction_failed",
        updated_at: now,
        phase: CORRECTION_PHASE,
      });
      events.push({
        type: "correction_failed",
        recorded_at: iso(),
        payload: {
          subtask_id: sid,
          attempt: nextAttempt,
          review_state: "rejected",
          correction_state: "correction_failed",
        },
      });
      const { tryApplyMiniActivityCorrectionFailed } = require("../../../core/update-execution-runtime-state");
      tryApplyMiniActivityCorrectionFailed(outputDirAbs, {
        subtaskId: sid,
        exhausted: false,
        reason: "correction_pipeline_failed",
      });
      runCorrectionCriticalRollback(outputDirAbs, execDir, resultsDir, sid, events, iso);
      correction_failed_subtasks += 1;
      artifacts.push(`${"execution/results"}/${correctionLoopFilename(sid)}`.replace(/\\/g, "/"));
      if (lc && lc.loaded) {
        const { saveExecutionCheckpoint } = require("./manage-execution-lifecycle");
        saveExecutionCheckpoint({
          execDir,
          outputDirAbs,
          loaded: lc.loaded,
          subtaskId: sid,
          lifecycleState: "running",
          recoveryState: "post_correction_pipeline_error",
          events,
          iso,
        });
      }
      continue;
    }

    doc = readJsonObject(stPath);
    if (!doc) continue;

    const exs = String(doc.execution_state || "");
    const rs = String(doc.review_state || "");
    const completedAt = iso();

    if (exs === "review_completed" && rs === "approved") {
      writeCorrectionLoop(resultsDir, sid, {
        version: 1,
        phase: CORRECTION_PHASE,
        subtask_id: sid,
        status: "correction_completed",
        correction_state: "retry_completed",
        attempt: nextAttempt,
        max_attempts: MAX_ATTEMPTS,
        requires_retry: false,
        retry_allowed: true,
        started_at: startedAt,
        completed_at: completedAt,
        source_review_state: "rejected",
        resulting_review_state: "approved",
        correction_summary: `Correction concluída na tentativa ${nextAttempt}.`,
        warnings: [],
        errors: [],
      });
      mergeExecutionSubtask(execDir, sid, {
        correction_state: "retry_completed",
        correction_completed_at: completedAt,
        phase: CORRECTION_PHASE,
        updated_at: completedAt,
      });
      events.push({
        type: "correction_completed",
        recorded_at: iso(),
        payload: {
          subtask_id: sid,
          attempt: nextAttempt,
          review_state: "approved",
          correction_state: "retry_completed",
        },
      });
      const { tryApplyMiniActivityCorrectionCompleted } = require("../../../core/update-execution-runtime-state");
      tryApplyMiniActivityCorrectionCompleted(outputDirAbs, {
        subtaskId: sid,
        reason: "correction_completed",
      });
      corrected_subtasks += 1;
      if (lc && lc.loaded) {
        const { saveExecutionCheckpoint } = require("./manage-execution-lifecycle");
        saveExecutionCheckpoint({
          execDir,
          outputDirAbs,
          loaded: lc.loaded,
          subtaskId: sid,
          lifecycleState: "running",
          recoveryState: "post_correction_completed",
          events,
          iso,
        });
      }
    } else if (wasRejectedForCorrection(doc) || (exs === "review_failed" && rs === "rejected")) {
      writeCorrectionLoop(resultsDir, sid, {
        version: 1,
        phase: CORRECTION_PHASE,
        subtask_id: sid,
        status: nextAttempt >= MAX_ATTEMPTS ? "retry_exhausted" : "correction_failed",
        correction_state: nextAttempt >= MAX_ATTEMPTS ? "retry_exhausted" : "correction_failed",
        attempt: nextAttempt,
        max_attempts: MAX_ATTEMPTS,
        requires_retry: nextAttempt < MAX_ATTEMPTS,
        retry_allowed: nextAttempt < MAX_ATTEMPTS,
        started_at: startedAt,
        completed_at: completedAt,
        source_review_state: "rejected",
        resulting_review_state: "rejected",
        correction_summary:
          nextAttempt >= MAX_ATTEMPTS
            ? "Review continua rejeitada após esgotar tentativas."
            : `Review rejeitada após tentativa ${nextAttempt}.`,
        warnings: [],
        errors: [],
      });
      mergeExecutionSubtask(execDir, sid, {
        correction_state: nextAttempt >= MAX_ATTEMPTS ? "retry_exhausted" : "correction_failed",
        updated_at: completedAt,
        phase: CORRECTION_PHASE,
      });
      if (nextAttempt >= MAX_ATTEMPTS) {
        retry_exhausted_subtasks += 1;
        events.push({
          type: "correction_retry_exhausted",
          recorded_at: iso(),
          payload: {
            subtask_id: sid,
            attempt: nextAttempt,
            review_state: "rejected",
            correction_state: "retry_exhausted",
          },
        });
        runCorrectionCriticalRollback(outputDirAbs, execDir, resultsDir, sid, events, iso);
      } else {
        correction_failed_subtasks += 1;
        events.push({
          type: "correction_failed",
          recorded_at: iso(),
          payload: {
            subtask_id: sid,
            attempt: nextAttempt,
            review_state: "rejected",
            correction_state: "correction_failed",
          },
        });
      }
      if (lc && lc.loaded) {
        const { saveExecutionCheckpoint } = require("./manage-execution-lifecycle");
        saveExecutionCheckpoint({
          execDir,
          outputDirAbs,
          loaded: lc.loaded,
          subtaskId: sid,
          lifecycleState: "running",
          recoveryState: "post_correction_cycle",
          events,
          iso,
        });
      }
    } else {
      const msg = `Estado inesperado após correction: execution_state=${exs} review_state=${rs}`;
      writeCorrectionLoop(resultsDir, sid, {
        version: 1,
        phase: CORRECTION_PHASE,
        subtask_id: sid,
        status: "correction_failed",
        correction_state: "correction_failed",
        attempt: nextAttempt,
        max_attempts: MAX_ATTEMPTS,
        requires_retry: false,
        retry_allowed: false,
        started_at: startedAt,
        completed_at: completedAt,
        source_review_state: "rejected",
        resulting_review_state: rs || "unknown",
        correction_summary: msg,
        warnings: [],
        errors: [msg],
      });
      mergeExecutionSubtask(execDir, sid, {
        correction_state: "correction_failed",
        updated_at: completedAt,
        phase: CORRECTION_PHASE,
      });
      events.push({
        type: "correction_failed",
        recorded_at: iso(),
        payload: {
          subtask_id: sid,
          attempt: nextAttempt,
          review_state: rs || "unknown",
          correction_state: "correction_failed",
        },
      });
      runCorrectionCriticalRollback(outputDirAbs, execDir, resultsDir, sid, events, iso);
      correction_failed_subtasks += 1;
      if (lc && lc.loaded) {
        const { saveExecutionCheckpoint } = require("./manage-execution-lifecycle");
        saveExecutionCheckpoint({
          execDir,
          outputDirAbs,
          loaded: lc.loaded,
          subtaskId: sid,
          lifecycleState: "running",
          recoveryState: "post_correction_unexpected",
          events,
          iso,
        });
      }
    }

    const rel = `${"execution/results"}/${correctionLoopFilename(sid)}`.replace(/\\/g, "/");
    if (!artifacts.includes(rel)) artifacts.push(rel);
  }

  for (const row of rows) {
    writeIdleCorrectionLoop(resultsDir, row.subtask_id, iso);
    const rel = `${"execution/results"}/${correctionLoopFilename(row.subtask_id)}`.replace(/\\/g, "/");
    if (!artifacts.includes(rel)) artifacts.push(rel);
  }

  return {
    artifacts,
    corrected_subtasks,
    correction_failed_subtasks,
    retry_exhausted_subtasks,
    correction_attempts_total,
    last_executor_subtask,
  };
}

module.exports = {
  CORRECTION_PHASE,
  MAX_ATTEMPTS,
  correctionLoopFilename,
  hasCorrectionWorkPending,
  runCorrectionRuntimePhase,
  isValidCompletedCorrection,
  wasRejectedForCorrection,
};
