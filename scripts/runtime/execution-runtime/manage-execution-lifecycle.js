"use strict";

const fs = require("fs");
const path = require("path");

const { readJsonObject } = require("./build-execution-session");
const {
  subtaskExecutionFilename,
  orderedSubtaskRows,
} = require("./build-subtask-execution-state");
const { findFirstRunnableSubtaskId } = require("./run-subtask-executor");

const LIFECYCLE_FILENAME = "execution-lifecycle.json";

const { MVP_EXECUTION_PHASE } = require("./execution-mvp-contract");
const LIFECYCLE_PHASE = MVP_EXECUTION_PHASE;

/** @type {ReadonlySet<string>} */
const GLOBAL_LIFECYCLE_STATES = new Set([
  "pending",
  "preparing",
  "running",
  "recovering",
  "resuming",
  "completed",
  "failed",
  "interrupted",
]);

const LIFECYCLE_STATUS_ACTIVE = "execution_lifecycle_active";

/**
 * @param {string} execDir
 */
function lifecyclePath(execDir) {
  return path.join(execDir, LIFECYCLE_FILENAME);
}

/**
 * @param {string} runId
 * @returns {Record<string, unknown>}
 */
function createInitialLifecycleDocument(runId) {
  const now = new Date().toISOString();
  return {
    version: 1,
    phase: LIFECYCLE_PHASE,
    status: LIFECYCLE_STATUS_ACTIVE,
    lifecycle_state: "pending",
    started_at: now,
    updated_at: now,
    completed_at: null,
    resume_supported: true,
    last_checkpoint: {
      subtask_id: null,
      state: null,
      timestamp: null,
    },
    execution_summary: {
      total_subtasks: 0,
      completed_subtasks: 0,
      failed_subtasks: 0,
      corrected_subtasks: 0,
    },
    recovery: {
      recovered_from_previous_session: false,
      resume_count: 0,
      last_resume_at: null,
    },
    run_id: String(runId || ""),
  };
}

/**
 * @param {string} execDir
 * @returns {Record<string, unknown>|null}
 */
function readLifecycleDocument(execDir) {
  const p = lifecyclePath(execDir);
  return readJsonObject(p);
}

/**
 * @param {string} execDir
 * @param {Record<string, unknown>} doc
 */
function writeLifecycleDocument(execDir, doc) {
  fs.mkdirSync(execDir, { recursive: true });
  fs.writeFileSync(lifecyclePath(execDir), JSON.stringify(doc, null, 2), "utf-8");
}

/**
 * @param {unknown} st
 * @returns {string}
 */
function normalizeGlobalLifecycleState(st) {
  const s = String(st || "").trim();
  return GLOBAL_LIFECYCLE_STATES.has(s) ? s : "";
}

/**
 * @param {string} execDir
 * @param {{ orderDoc: Record<string, unknown> }} loaded
 */
function computeExecutionSummaryForLifecycle(execDir, loaded) {
  const rows = orderedSubtaskRows(loaded.orderDoc);
  let completed = 0;
  let failed = 0;
  let corrected = 0;
  for (const row of rows) {
    const fn = subtaskExecutionFilename(row.subtask_id);
    if (!fn) continue;
    const doc = readJsonObject(path.join(execDir, "subtasks", fn));
    if (!doc) continue;
    const ex = String(doc.execution_state || "");
    if (ex === "review_completed" && String(doc.review_state || "") === "approved") {
      completed += 1;
    } else if (
      ex === "retry_exhausted" ||
      ex === "execution_failed" ||
      ex === "failed" ||
      ex === "patch_validation_failed" ||
      ex === "review_failed" ||
      ex === "correction_failed"
    ) {
      failed += 1;
    }
    const cs = String(doc.correction_state || "");
    if (cs === "retry_completed" || ex === "correction_completed") {
      corrected += 1;
    }
  }
  return {
    total_subtasks: rows.length,
    completed_subtasks: completed,
    failed_subtasks: failed,
    corrected_subtasks: corrected,
  };
}

/**
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} patch
 */
function mergeLifecycleRecovery(base, patch) {
  const cur =
    base.recovery && typeof base.recovery === "object" && !Array.isArray(base.recovery)
      ? /** @type {Record<string, unknown>} */ ({ .../** @type {Record<string, unknown>} */ (base.recovery) })
      : {
          recovered_from_previous_session: false,
          resume_count: 0,
          last_resume_at: null,
        };
  for (const [k, v] of Object.entries(patch)) {
    cur[k] = v;
  }
  base.recovery = cur;
}

/**
 * @param {{
 *   execDir: string,
 *   outputDirAbs: string,
 *   loaded: { orderDoc: Record<string, unknown> },
 *   runId: string,
 *   force: boolean,
 *   resume: boolean,
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 * }} p
 * @returns {{ lifecycle: Record<string, unknown>, resumedThisRun: boolean, recoveredFlag: boolean }}
 */
function prepareLifecycleAtRuntimeStart(p) {
  const { execDir, loaded, runId, force, resume, events, iso } = p;
  const now = iso();

  if (force) {
    const fresh = /** @type {Record<string, unknown>} */ (createInitialLifecycleDocument(runId));
    fresh.started_at = now;
    fresh.updated_at = now;
    mergeLifecycleRecovery(fresh, { recovered_from_previous_session: false, resume_count: 0, last_resume_at: null });
    fresh.lifecycle_state = "running";
    writeLifecycleDocument(execDir, fresh);
    events.push({
      type: "execution_lifecycle_started",
      recorded_at: now,
      payload: {
        subtask_id: null,
        lifecycle_state: "running",
        recovery_state: "force_reset",
        resume_count: 0,
      },
    });
    return { lifecycle: fresh, resumedThisRun: false, recoveredFlag: false };
  }

  let doc = readLifecycleDocument(execDir);
  let createdFresh = false;
  if (!doc || Number(doc.version) !== 1) {
    doc = /** @type {Record<string, unknown>} */ (createInitialLifecycleDocument(runId));
    doc.updated_at = now;
    createdFresh = true;
    writeLifecycleDocument(execDir, doc);
  }

  const prevState = normalizeGlobalLifecycleState(doc.lifecycle_state);
  const wasIncomplete =
    !createdFresh &&
    prevState &&
    prevState !== "completed" &&
    prevState !== "failed" &&
    prevState !== "pending" &&
    prevState !== "preparing" &&
    (prevState === "running" ||
      prevState === "resuming" ||
      prevState === "recovering" ||
      prevState === "interrupted");

  let recoveredFlag = false;
  let resumedThisRun = false;

  if (wasIncomplete) {
    recoveredFlag = true;
    mergeLifecycleRecovery(doc, { recovered_from_previous_session: true });
    doc.lifecycle_state = "recovering";
    doc.updated_at = now;
    doc.status = LIFECYCLE_STATUS_ACTIVE;
    writeLifecycleDocument(execDir, doc);
    const rc =
      doc.recovery && typeof doc.recovery === "object" && !Array.isArray(doc.recovery)
        ? Number(/** @type {Record<string, unknown>} */ (doc.recovery).resume_count) || 0
        : 0;
    events.push({
      type: "execution_recovery_started",
      recorded_at: now,
      payload: {
        subtask_id: doc.last_checkpoint && typeof doc.last_checkpoint === "object" && !Array.isArray(doc.last_checkpoint)
          ? /** @type {Record<string, unknown>} */ (doc.last_checkpoint).subtask_id != null
            ? String(/** @type {Record<string, unknown>} */ (doc.last_checkpoint).subtask_id)
            : null
          : null,
        lifecycle_state: "recovering",
        recovery_state: "detected_incomplete_session",
        resume_count: rc,
      },
    });

    if (resume) {
      resumedThisRun = true;
      mergeLifecycleRecovery(doc, {
        resume_count: rc + 1,
        last_resume_at: now,
      });
      doc.lifecycle_state = "resuming";
      doc.updated_at = iso();
      writeLifecycleDocument(execDir, doc);
      events.push({
        type: "execution_resumed",
        recorded_at: iso(),
        payload: {
          subtask_id:
            doc.last_checkpoint &&
            typeof doc.last_checkpoint === "object" &&
            !Array.isArray(doc.last_checkpoint) &&
            /** @type {Record<string, unknown>} */ (doc.last_checkpoint).subtask_id != null
              ? String(/** @type {Record<string, unknown>} */ (doc.last_checkpoint).subtask_id)
              : null,
          lifecycle_state: "resuming",
          recovery_state: "resume_cli",
          resume_count: rc + 1,
        },
      });
    }
  }

  doc.lifecycle_state = "running";
  doc.updated_at = iso();
  doc.status = LIFECYCLE_STATUS_ACTIVE;
  doc.completed_at = null;
  writeLifecycleDocument(execDir, doc);

  if (createdFresh) {
    events.push({
      type: "execution_lifecycle_started",
      recorded_at: iso(),
      payload: {
        subtask_id: null,
        lifecycle_state: "running",
        recovery_state: "initialized",
        resume_count: 0,
      },
    });
  } else if (!wasIncomplete) {
    const rc0 =
      doc.recovery && typeof doc.recovery === "object" && !Array.isArray(doc.recovery)
        ? Number(/** @type {Record<string, unknown>} */ (doc.recovery).resume_count) || 0
        : 0;
    events.push({
      type: "execution_lifecycle_started",
      recorded_at: iso(),
      payload: {
        subtask_id: null,
        lifecycle_state: "running",
        recovery_state: "continued",
        resume_count: rc0,
      },
    });
  }

  return { lifecycle: doc, resumedThisRun, recoveredFlag };
}

/**
 * @param {{
 *   execDir: string,
 *   outputDirAbs: string,
 *   loaded: { orderDoc: Record<string, unknown> },
 *   subtaskId: string|null,
 *   lifecycleState: string,
 *   recoveryState: string,
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 * }} p
 */
function saveExecutionCheckpoint(p) {
  const { execDir, loaded, subtaskId, lifecycleState, recoveryState, events, iso } = p;
  const doc = readLifecycleDocument(execDir);
  if (!doc || Number(doc.version) !== 1) return;

  const st = normalizeGlobalLifecycleState(lifecycleState) || "running";
  doc.updated_at = iso();
  doc.last_checkpoint = {
    subtask_id: subtaskId && /^\d{3}$/.test(String(subtaskId)) ? String(subtaskId) : null,
    state: st,
    timestamp: iso(),
  };
  doc.execution_summary = computeExecutionSummaryForLifecycle(execDir, loaded);
  writeLifecycleDocument(execDir, doc);

  if (subtaskId && /^\d{3}$/.test(String(subtaskId))) {
    const fn = subtaskExecutionFilename(subtaskId);
    const fp = path.join(execDir, "subtasks", fn);
    const sub = readJsonObject(fp);
    if (sub && typeof sub === "object" && !Array.isArray(sub)) {
      const d = /** @type {Record<string, unknown>} */ (sub);
      d.lifecycle_updated_at = iso();
      d.recovery_state = String(recoveryState || "checkpoint");
      fs.writeFileSync(fp, JSON.stringify(d, null, 2), "utf-8");
    }
  }

  const rc =
    doc.recovery && typeof doc.recovery === "object" && !Array.isArray(doc.recovery)
      ? Number(/** @type {Record<string, unknown>} */ (doc.recovery).resume_count) || 0
      : 0;

  events.push({
    type: "execution_checkpoint_saved",
    recorded_at: iso(),
    payload: {
      subtask_id: subtaskId && /^\d{3}$/.test(String(subtaskId)) ? String(subtaskId) : null,
      lifecycle_state: st,
      recovery_state: String(recoveryState || ""),
      resume_count: rc,
    },
  });
}

/**
 * @param {{
 *   execDir: string,
 *   loaded: { orderDoc: Record<string, unknown> },
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 *   terminal: "completed"|"failed",
 * }} p
 */
function finalizeLifecycleDocument(p) {
  const { execDir, loaded, events, iso, terminal } = p;
  const doc = readLifecycleDocument(execDir);
  if (!doc || Number(doc.version) !== 1) return;
  const now = iso();
  doc.lifecycle_state = terminal;
  doc.updated_at = now;
  doc.completed_at = now;
  doc.status = LIFECYCLE_STATUS_ACTIVE;
  doc.execution_summary = computeExecutionSummaryForLifecycle(execDir, loaded);
  writeLifecycleDocument(execDir, doc);
  const rc =
    doc.recovery && typeof doc.recovery === "object" && !Array.isArray(doc.recovery)
      ? Number(/** @type {Record<string, unknown>} */ (doc.recovery).resume_count) || 0
      : 0;
  events.push({
    type: "execution_lifecycle_completed",
    recorded_at: now,
    payload: {
      subtask_id: null,
      lifecycle_state: terminal,
      recovery_state: "terminal",
      resume_count: rc,
    },
  });
}

/**
 * @param {{
 *   execDir: string,
 *   loaded: { orderDoc: Record<string, unknown> },
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 * }} p
 */
function markLifecycleInterrupted(p) {
  const { execDir, loaded, events, iso } = p;
  const doc = readLifecycleDocument(execDir);
  if (!doc || Number(doc.version) !== 1) return;
  doc.lifecycle_state = "interrupted";
  doc.updated_at = iso();
  doc.execution_summary = computeExecutionSummaryForLifecycle(execDir, loaded);
  writeLifecycleDocument(execDir, doc);
  const rc =
    doc.recovery && typeof doc.recovery === "object" && !Array.isArray(doc.recovery)
      ? Number(/** @type {Record<string, unknown>} */ (doc.recovery).resume_count) || 0
      : 0;
  events.push({
    type: "execution_interrupted",
    recorded_at: iso(),
    payload: {
      subtask_id:
        doc.last_checkpoint &&
        typeof doc.last_checkpoint === "object" &&
        !Array.isArray(doc.last_checkpoint) &&
        /** @type {Record<string, unknown>} */ (doc.last_checkpoint).subtask_id != null
          ? String(/** @type {Record<string, unknown>} */ (doc.last_checkpoint).subtask_id)
          : null,
      lifecycle_state: "interrupted",
      recovery_state: "persisted",
      resume_count: rc,
    },
  });
}

/**
 * @param {{ type: string, recorded_at: string, payload?: Record<string, unknown> }[]} events
 */
function summarizeLifecycleFromEvents(events) {
  let recovery_count = 0;
  let interrupted_sessions = 0;
  let resumed_sessions = 0;
  let checkpoints_saved = 0;
  for (const ev of events) {
    if (ev.type === "execution_recovery_started") recovery_count += 1;
    if (ev.type === "execution_interrupted") interrupted_sessions += 1;
    if (ev.type === "execution_resumed") resumed_sessions += 1;
    if (ev.type === "execution_checkpoint_saved") checkpoints_saved += 1;
  }
  return { recovery_count, interrupted_sessions, resumed_sessions, checkpoints_saved };
}

/**
 * @param {string} outputDirAbs
 * @param {{ orderDoc: Record<string, unknown> }} loaded
 * @returns {string|null}
 */
function pickResumeTargetSubtaskId(outputDirAbs, loaded) {
  return findFirstRunnableSubtaskId(outputDirAbs, loaded);
}

module.exports = {
  LIFECYCLE_FILENAME,
  LIFECYCLE_REL: `execution/${LIFECYCLE_FILENAME}`,
  LIFECYCLE_PHASE,
  GLOBAL_LIFECYCLE_STATES,
  createInitialLifecycleDocument,
  readLifecycleDocument,
  writeLifecycleDocument,
  prepareLifecycleAtRuntimeStart,
  saveExecutionCheckpoint,
  finalizeLifecycleDocument,
  markLifecycleInterrupted,
  summarizeLifecycleFromEvents,
  computeExecutionSummaryForLifecycle,
  pickResumeTargetSubtaskId,
};
