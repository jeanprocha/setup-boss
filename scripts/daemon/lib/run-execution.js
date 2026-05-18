"use strict";

const fs = require("fs");
const path = require("path");

const { resolveOutputDir } = require("../../../core/run-resolver");
const { isSafeRelativePath } = require("./run-evidence");
const {
  orderedSubtaskRows,
  subtaskExecutionFilename,
} = require("../../runtime/execution-runtime/build-subtask-execution-state");
const { loadHandoffAndOrderForExecution } = require("../../runtime/execution-runtime/build-execution-session");
const {
  loadExecutionRuntimeState,
  materializeExecutionRuntimeFromOes,
} = require("../../../core/materialize-execution-runtime-from-oes");
const { mapExecutionRuntimeStateDto } = require("../../../core/map-execution-runtime-state-dto");

const EXECUTION_DIR = "execution";
const RESULTS_DIR = "results";

/**
 * @param {string} fp
 * @returns {Record<string, unknown>|null}
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
 * @param {string} outputDir
 * @param {string} rel
 */
function safeReadArtifact(outputDir, rel) {
  const norm = String(rel || "").replace(/\\/g, "/").trim();
  if (!isSafeRelativePath(norm)) return null;
  return safeReadJson(path.join(outputDir, norm.replace(/\//g, path.sep)));
}

/**
 * @param {string} raw
 */
function mapSubtaskUiState(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "pending" || s === "preparing") return "pending";
  if (s === "handoff_preparing" || s === "handoff_ready" || s === "ready" || s === "queued")
    return "queued";
  if (s === "executing" || s === "running") return "running";
  if (s.startsWith("review") || s === "reviewing") return "reviewing";
  if (s.startsWith("correction") || s === "correcting") return "correcting";
  if (s.startsWith("retry") || s === "retrying") return "retrying";
  if (s === "blocked" || s === "interrupted") return "blocked";
  if (s === "failed" || s.endsWith("_failed")) return "failed";
  if (s === "recovered" || s.includes("recovery")) return "recovered";
  if (s === "completed" || s.endsWith("_completed")) return "completed";
  return "pending";
}

/**
 * @param {string} lifecycleState
 * @param {Record<string, unknown>|null} session
 */
function mapLifecyclePhase(lifecycleState, session) {
  const s = String(lifecycleState || "").toLowerCase();
  if (s === "completed") return "execution_completed";
  if (s === "failed") return "execution_failed";
  if (s === "interrupted") return "execution_blocked";
  if (s === "recovering" || s === "resuming") return "recovery_running";
  if (s === "running") return "execution_running";
  if (session) {
    const phaseHint = String(session.current_phase || session.phase || "").toLowerCase();
    if (phaseHint.includes("review")) return "review_running";
    if (phaseHint.includes("correction")) return "correction_running";
    if (phaseHint.includes("retry")) return "retry_running";
    if (phaseHint.includes("rollback")) return "rollback_running";
    if (phaseHint.includes("recovery")) return "recovery_running";
  }
  return "execution_pending";
}

/**
 * @param {string} reviewState
 */
function mapReviewStatus(reviewState) {
  const s = String(reviewState || "").toLowerCase();
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "pending" || s === "in_progress") return "pending";
  return "none";
}

/**
 * @param {string} execDir
 * @param {string} subtaskId
 */
function readReviewDoc(execDir, subtaskId) {
  const fn = `${subtaskId}-execution-review.json`;
  return safeReadJson(path.join(execDir, RESULTS_DIR, fn));
}

/**
 * @param {string} execDir
 * @param {string} subtaskId
 */
function readCorrectionDoc(execDir, subtaskId) {
  const fn = `${subtaskId}-correction-loop.json`;
  return safeReadJson(path.join(execDir, RESULTS_DIR, fn));
}

/**
 * @param {string} outputDir
 * @param {string} runId
 */
function collectExecutionBundle(outputDir, runId) {
  const dir = path.resolve(outputDir);
  const execDir = path.join(dir, EXECUTION_DIR);
  const ctx = safeReadJson(path.join(dir, "run-context.json"));
  const phase4 =
    ctx && ctx.phase4 && typeof ctx.phase4 === "object" ? ctx.phase4 : null;

  const hasExecDir = fs.existsSync(execDir);
  const session = safeReadJson(path.join(execDir, "execution-session.json"));
  const lifecycle = safeReadJson(path.join(execDir, "execution-lifecycle.json"));
  const diagnostics = safeReadJson(path.join(execDir, "execution-diagnostics.json"));

  const handoffLoad = loadHandoffAndOrderForExecution(dir);
  const orderDoc = handoffLoad.ok ? handoffLoad.orderDoc : null;
  const rows = orderDoc ? orderedSubtaskRows(orderDoc) : [];

  if (!hasExecDir && !session && !lifecycle && rows.length === 0) {
    return {
      ok: true,
      data: buildEmptyExecutionBundle(runId, {
        source: "unsupported",
        unsupportedReason: "Corrida sem artifacts de execution (phase4).",
      }),
    };
  }

  /** @type {ReturnType<typeof mapSubtaskRow>[]} */
  const subtasks = [];
  for (const row of rows) {
    const stDoc = (() => {
      const fn = subtaskExecutionFilename(row.subtask_id);
      if (!fn) return null;
      return safeReadJson(path.join(execDir, "subtasks", fn));
    })();
    subtasks.push(mapSubtaskRow(row, stDoc, execDir));
  }

  if (!subtasks.length && hasExecDir) {
    try {
      const stDir = path.join(execDir, "subtasks");
      if (fs.existsSync(stDir)) {
        for (const name of fs.readdirSync(stDir)) {
          const m = /^(\d{3})-execution\.json$/i.exec(name);
          if (!m) continue;
          const stDoc = safeReadJson(path.join(stDir, name));
          subtasks.push(
            mapSubtaskRow(
              {
                subtask_id: m[1],
                position: subtasks.length + 1,
                title: stDoc && stDoc.title != null ? String(stDoc.title) : m[1],
                depends_on: [],
              },
              stDoc,
              execDir,
            ),
          );
        }
      }
    } catch {
      /* */
    }
  }

  const progress = computeProgress(subtasks);
  const lifecyclePhase = mapLifecyclePhase(
    lifecycle ? String(lifecycle.lifecycle_state || "") : "",
    session,
  );
  const aggregateReview = aggregateReviewState(subtasks, diagnostics);
  const aggregateCorrection = aggregateCorrectionState(subtasks, execDir);
  const retry = aggregateRetryState(subtasks, diagnostics);
  const recovery = aggregateRecoveryState(lifecycle, diagnostics);
  const blockers = collectBlockers(subtasks, diagnostics, lifecycle);

  const partial = !session && !lifecycle && subtasks.length === 0;

  const updatedAt =
    (lifecycle && lifecycle.updated_at != null ? String(lifecycle.updated_at) : null) ||
    (session && session.updated_at != null ? String(session.updated_at) : null) ||
    (phase4 && phase4.updated_at != null ? String(phase4.updated_at) : null);

  const label =
    ctx && ctx.task && typeof ctx.task === "object" && ctx.task.title != null
      ? String(ctx.task.title)
      : runId;

  let health = "partial";
  if (lifecyclePhase === "execution_completed") health = "healthy";
  else if (lifecyclePhase === "execution_failed") health = "degraded";
  else if (partial) health = "unavailable";

  const source = partial ? "partial" : "runtime";

  let currentSubtaskId =
    lifecycle &&
    lifecycle.last_checkpoint &&
    typeof lifecycle.last_checkpoint === "object" &&
    lifecycle.last_checkpoint.subtask_id != null
      ? String(lifecycle.last_checkpoint.subtask_id)
      : session && session.current_subtask_id != null
        ? String(session.current_subtask_id)
        : null;

  let materializedExecution = null;
  try {
    let loadedState = loadExecutionRuntimeState(dir);
    if (!loadedState.ok) {
      materializeExecutionRuntimeFromOes(dir, { runId });
      loadedState = loadExecutionRuntimeState(dir);
    }
    if (loadedState.ok) {
      materializedExecution = mapExecutionRuntimeStateDto(loadedState.state);
      if (
        materializedExecution &&
        materializedExecution.currentMiniActivityId &&
        !currentSubtaskId
      ) {
        const activeMa = materializedExecution.miniActivities.find(
          (m) => m.miniActivityId === materializedExecution.currentMiniActivityId,
        );
        if (activeMa && activeMa.subtaskId) {
          currentSubtaskId = activeMa.subtaskId;
        }
      }
    }
  } catch {
    materializedExecution = null;
  }

  return {
    ok: true,
    data: {
      summary: {
        runId,
        label,
        lifecycle: {
          phase: lifecyclePhase,
          currentSubtaskId,
          startedAt:
            lifecycle && lifecycle.started_at != null
              ? String(lifecycle.started_at)
              : session && session.started_at != null
                ? String(session.started_at)
                : null,
          updatedAt,
        },
        progress,
        review: aggregateReview,
        correction: aggregateCorrection,
        retry,
        recovery,
        blockers,
        health,
        source,
        unsupportedReason: partial
          ? "Execution parcial — sessão/lifecycle ou subtasks em falta."
          : null,
      },
      subtasks,
      materializedExecution,
      source,
      unsupportedReason: null,
    },
  };
}

/**
 * @param {{ subtask_id: string, position: number, title: string, depends_on: string[] }} row
 * @param {Record<string, unknown>|null} stDoc
 * @param {string} execDir
 */
function mapSubtaskRow(row, stDoc, execDir) {
  const id = row.subtask_id;
  const reviewDoc = readReviewDoc(execDir, id);
  const correctionDoc = readCorrectionDoc(execDir, id);
  const execState = stDoc ? String(stDoc.execution_state || stDoc.status || "pending") : "pending";
  const reviewState = mapReviewStatus(
    reviewDoc && reviewDoc.review_state != null
      ? String(reviewDoc.review_state)
      : stDoc && stDoc.review_state != null
        ? String(stDoc.review_state)
        : "",
  );
  const corrStatusRaw =
    correctionDoc && correctionDoc.status != null
      ? String(correctionDoc.status)
      : stDoc && stDoc.correction_state != null
        ? String(stDoc.correction_state)
        : "idle";
  const corrStatus =
    corrStatusRaw === "active" ||
    corrStatusRaw === "awaiting_review" ||
    corrStatusRaw === "closed"
      ? corrStatusRaw
      : corrStatusRaw.includes("correction")
        ? "active"
        : "idle";

  const attempts = stDoc && typeof stDoc.attempts === "number" ? stDoc.attempts : 0;
  const readiness =
    execState.includes("failed") || execState === "blocked"
      ? "blocked"
      : execState.includes("completed") || execState.includes("ready")
        ? "ready"
        : "not_ready";

  return {
    id,
    title: String(stDoc && stDoc.title != null ? stDoc.title : row.title || id),
    order: row.position,
    state: mapSubtaskUiState(execState),
    durationMs:
      stDoc && typeof stDoc.duration_ms === "number"
        ? stDoc.duration_ms
        : null,
    retryCount: attempts,
    review: {
      status: reviewState,
      rejectionReason:
        reviewDoc && reviewDoc.rejection_reason != null
          ? String(reviewDoc.rejection_reason)
          : null,
      reviewerHint:
        reviewDoc && reviewDoc.reviewer_hint != null
          ? String(reviewDoc.reviewer_hint)
          : null,
      decidedAt:
        reviewDoc && reviewDoc.review_completed_at != null
          ? String(reviewDoc.review_completed_at)
          : stDoc && stDoc.review_completed_at != null
            ? String(stDoc.review_completed_at)
            : null,
    },
    correction: {
      generation:
        correctionDoc && typeof correctionDoc.generation === "number"
          ? correctionDoc.generation
          : 0,
      status: corrStatus,
    },
    readiness,
    blockerLabel:
      stDoc && stDoc.blocker_label != null
        ? String(stDoc.blocker_label)
        : execState.includes("failed")
          ? execState
          : null,
  };
}

/**
 * @param {ReturnType<typeof mapSubtaskRow>[]} subtasks
 */
function computeProgress(subtasks) {
  const total = subtasks.length;
  let completed = 0;
  let active = 0;
  let blocked = 0;
  let failed = 0;
  let pending = 0;
  for (const st of subtasks) {
    if (st.state === "completed" || st.state === "recovered") completed += 1;
    else if (st.state === "failed") failed += 1;
    else if (st.state === "blocked") blocked += 1;
    else if (st.state === "running" || st.state === "reviewing" || st.state === "correcting" || st.state === "retrying")
      active += 1;
    else pending += 1;
  }
  return { completed, active, blocked, failed, pending, total };
}

/**
 * @param {ReturnType<typeof mapSubtaskRow>[]} subtasks
 * @param {Record<string, unknown>|null} diagnostics
 */
function aggregateReviewState(subtasks, diagnostics) {
  const rejected = subtasks.find((s) => s.review.status === "rejected");
  if (rejected) {
    return {
      status: "rejected",
      rejectionReason: rejected.review.rejectionReason,
      reviewerHint: rejected.review.reviewerHint,
      decidedAt: rejected.review.decidedAt,
    };
  }
  const pending = subtasks.find((s) => s.review.status === "pending");
  if (pending) {
    return {
      status: "pending",
      rejectionReason: null,
      reviewerHint: null,
      decidedAt: null,
    };
  }
  const approved = subtasks.every((s) => s.review.status === "approved" || s.review.status === "none");
  if (approved && subtasks.some((s) => s.review.status === "approved")) {
    return {
      status: "approved",
      rejectionReason: null,
      reviewerHint: null,
      decidedAt: subtasks.find((s) => s.review.decidedAt)?.review.decidedAt ?? null,
    };
  }
  if (diagnostics && Array.isArray(diagnostics.events)) {
    const ev = diagnostics.events.find((e) =>
      e && typeof e === "object" && String(/** @type {Record<string, unknown>} */ (e).type || "").includes("review"),
    );
    if (ev) {
      return { status: "pending", rejectionReason: null, reviewerHint: null, decidedAt: null };
    }
  }
  return { status: "none", rejectionReason: null, reviewerHint: null, decidedAt: null };
}

/**
 * @param {ReturnType<typeof mapSubtaskRow>[]} subtasks
 * @param {string} execDir
 */
function aggregateCorrectionState(subtasks, execDir) {
  let active = null;
  for (const st of subtasks) {
    if (st.correction.status === "active" || st.correction.status === "awaiting_review") {
      const doc = readCorrectionDoc(execDir, st.id);
      active = {
        generation: st.correction.generation,
        status: st.correction.status,
        summary: doc && doc.summary != null ? String(doc.summary) : null,
        rejectionReason:
          doc && doc.rejection_reason != null ? String(doc.rejection_reason) : st.review.rejectionReason,
        approvedAfterCorrection: Boolean(doc && doc.approved_after_correction),
      };
      break;
    }
  }
  if (active) return active;
  return {
    generation: 0,
    status: "idle",
    summary: null,
    rejectionReason: null,
    approvedAfterCorrection: false,
  };
}

/**
 * @param {ReturnType<typeof mapSubtaskRow>[]} subtasks
 * @param {Record<string, unknown>|null} diagnostics
 */
function aggregateRetryState(subtasks, diagnostics) {
  const maxAttempts = 3;
  const withRetry = subtasks.filter((s) => s.retryCount > 0 || s.state === "retrying");
  const count = withRetry.reduce((m, s) => Math.max(m, s.retryCount), 0);
  const active = subtasks.some((s) => s.state === "retrying");
  let reason = null;
  let lastAttemptAt = null;
  if (diagnostics && Array.isArray(diagnostics.events)) {
    for (let i = diagnostics.events.length - 1; i >= 0; i -= 1) {
      const ev = diagnostics.events[i];
      if (!ev || typeof ev !== "object") continue;
      const typ = String(/** @type {Record<string, unknown>} */ (ev).type || "");
      if (!typ.includes("retry")) continue;
      reason = typ;
      lastAttemptAt =
        /** @type {Record<string, unknown>} */ (ev).recorded_at != null
          ? String(/** @type {Record<string, unknown>} */ (ev).recorded_at)
          : null;
      break;
    }
  }
  return {
    active,
    count,
    maxAttempts,
    reason,
    lastAttemptAt,
  };
}

/**
 * @param {Record<string, unknown>|null} lifecycle
 * @param {Record<string, unknown>|null} diagnostics
 */
function aggregateRecoveryState(lifecycle, diagnostics) {
  const rec =
    lifecycle && lifecycle.recovery && typeof lifecycle.recovery === "object"
      ? lifecycle.recovery
      : null;
  const lifecycleState = lifecycle ? String(lifecycle.lifecycle_state || "") : "";
  if (lifecycleState === "recovering" || lifecycleState === "resuming") {
    return {
      status: "in_progress",
      summary: "Recuperação de sessão em curso.",
      recoveredSubtasks: 0,
      problematicSubtasks: 0,
    };
  }
  if (rec && rec.recovered_from_previous_session) {
    return {
      status: "completed",
      summary: "Sessão anterior recuperada.",
      recoveredSubtasks:
        lifecycle &&
        lifecycle.execution_summary &&
        typeof lifecycle.execution_summary === "object"
          ? Number(
              /** @type {Record<string, unknown>} */ (lifecycle.execution_summary)
                .completed_subtasks || 0,
            )
          : 0,
      problematicSubtasks:
        lifecycle &&
        lifecycle.execution_summary &&
        typeof lifecycle.execution_summary === "object"
          ? Number(
              /** @type {Record<string, unknown>} */ (lifecycle.execution_summary)
                .failed_subtasks || 0,
            )
          : 0,
    };
  }
  if (diagnostics && Array.isArray(diagnostics.events)) {
    const hit = diagnostics.events.some((e) =>
      e && typeof e === "object" && String(/** @type {Record<string, unknown>} */ (e).type || "").includes("recovery"),
    );
    if (hit) {
      return {
        status: "degraded",
        summary: "Eventos de recovery nos diagnostics.",
        recoveredSubtasks: 0,
        problematicSubtasks: 0,
      };
    }
  }
  return {
    status: "none",
    summary: null,
    recoveredSubtasks: 0,
    problematicSubtasks: 0,
  };
}

/**
 * @param {ReturnType<typeof mapSubtaskRow>[]} subtasks
 * @param {Record<string, unknown>|null} diagnostics
 * @param {Record<string, unknown>|null} lifecycle
 */
function collectBlockers(subtasks, diagnostics, lifecycle) {
  /** @type {{ id: string, label: string, severity: "low"|"medium"|"high", source: string|null }[]} */
  const out = [];
  let i = 0;
  const push = (label, severity = "medium", source = null) => {
    i += 1;
    out.push({
      id: `blk-${i}`,
      label: String(label).slice(0, 240),
      severity,
      source,
    });
  };
  for (const st of subtasks) {
    if (st.state === "blocked" || st.readiness === "blocked") {
      push(st.blockerLabel || `Subtask ${st.id} bloqueada`, "high", "subtask");
    } else if (st.state === "failed") {
      push(st.blockerLabel || `Subtask ${st.id} falhou`, "high", "subtask");
    }
  }
  if (lifecycle && String(lifecycle.lifecycle_state || "") === "interrupted") {
    push("Lifecycle interrompido", "high", "runtime");
  }
  if (diagnostics && Array.isArray(diagnostics.events)) {
    for (const ev of diagnostics.events.slice(-30)) {
      if (!ev || typeof ev !== "object") continue;
      const e = /** @type {Record<string, unknown>} */ (ev);
      const sev = String(e.severity || "").toLowerCase();
      if (sev !== "error" && sev !== "critical") continue;
      const msg = e.message != null ? String(e.message) : String(e.type || "erro");
      push(msg, "high", "runtime");
      if (out.length >= 8) break;
    }
  }
  return out;
}

/**
 * @param {string} runId
 * @param {{ source: string, unsupportedReason: string|null }} meta
 */
function buildEmptyExecutionBundle(runId, meta) {
  return {
    summary: {
      runId,
      label: runId,
      lifecycle: {
        phase: "execution_pending",
        currentSubtaskId: null,
        startedAt: null,
        updatedAt: null,
      },
      progress: {
        completed: 0,
        active: 0,
        blocked: 0,
        failed: 0,
        pending: 0,
        total: 0,
      },
      review: {
        status: "none",
        rejectionReason: null,
        reviewerHint: null,
        decidedAt: null,
      },
      correction: {
        generation: 0,
        status: "idle",
        summary: null,
        rejectionReason: null,
        approvedAfterCorrection: false,
      },
      retry: {
        active: false,
        count: 0,
        maxAttempts: 3,
        reason: null,
        lastAttemptAt: null,
      },
      recovery: {
        status: "none",
        summary: null,
        recoveredSubtasks: 0,
        problematicSubtasks: 0,
      },
      blockers: [],
      health: "unavailable",
      source: meta.source,
      unsupportedReason: meta.unsupportedReason,
    },
    subtasks: [],
    materializedExecution: null,
    source: meta.source,
    unsupportedReason: meta.unsupportedReason,
  };
}

/**
 * @param {string} runId
 */
function collectExecutionForRun(runId) {
  let outputDir;
  try {
    outputDir = resolveOutputDir(runId, { warnLegacy: false });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "Output indisponível.";
    return { ok: false, error: { code: "output_unavailable", message: msg } };
  }
  return collectExecutionBundle(outputDir, runId);
}

module.exports = {
  collectExecutionForRun,
  collectExecutionBundle,
};
