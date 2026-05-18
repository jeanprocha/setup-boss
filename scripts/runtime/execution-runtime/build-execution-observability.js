"use strict";

const fs = require("fs");
const path = require("path");

const { readJsonObject, loadHandoffAndOrderForExecution } = require("./build-execution-session");
const {
  orderedSubtaskRows,
  subtaskExecutionFilename,
} = require("./build-subtask-execution-state");
const { rollbackStatePath, ROLLBACK_DIRNAME, ROLLBACK_STATE_FILENAME } = require("./manage-execution-rollback");
const { LIFECYCLE_FILENAME } = require("./manage-execution-lifecycle");
const {
  patchValidationFilename,
} = require("./validate-execution-patch");
const {
  executionResultFilename,
} = require("./run-subtask-executor");
const {
  executionReviewFilename,
} = require("./run-execution-review");
const {
  correctionLoopFilename,
} = require("./run-correction-runtime");
const { MVP_EXECUTION_PHASE, isAcceptedBundlePhase } = require("./execution-mvp-contract");

const OBSERVABILITY_FILE = "execution-observability.json";
const EXECUTION_DIRNAME = "execution";
const SESSION_FILE = "execution-session.json";
const DIAGNOSTICS_FILE = "execution-diagnostics.json";
const RESULTS_DIRNAME = "results";
const SUBTASKS_DIRNAME = "subtasks";

/** Limite de entradas na timeline operacional (segurança). */
const MAX_TIMELINE_EVENTS = 2500;

/** Limite de warnings/erros agregados listados (evita explosão). */
const MAX_WARNINGS_LIST = 120;
const MAX_ERRORS_LIST = 120;

const OBS_PHASE = MVP_EXECUTION_PHASE;
const OBS_STATUS = "observability_active";

/**
 * @param {{ type?: string }[]} events
 */
function stripObservabilityDiagnosticEvents(events) {
  return events.filter((e) => e && !String(e.type || "").startsWith("observability_"));
}

/**
 * @param {string} ts
 */
function isRoughIsoTimestamp(ts) {
  if (typeof ts !== "string" || !ts.trim()) return false;
  const s = ts.trim();
  if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

/**
 * @param {string} evType
 * @returns {string}
 */
function mapEventToTimelineCategory(evType) {
  const t = String(evType || "");
  if (t === "execution_runtime_started" || t === "execution_runtime_initialized") return "execution_start";
  if (t === "subtask_execution_started" || t === "subtask_execution_completed" || t === "subtask_execution_failed") {
    return "subtask_execution";
  }
  if (t.startsWith("patch_validation")) return "validation";
  if (t.startsWith("execution_review")) return "review";
  if (t.startsWith("correction") || t === "correction_retry_exhausted") return "correction";
  if (t.startsWith("rollback_")) return "rollback";
  if (t === "execution_recovery_started" || t === "execution_resumed") return "recovery";
  if (t === "execution_runtime_completed" || t === "execution_lifecycle_completed") return "completion";
  if (t.startsWith("observability_")) return "observability";
  if (t.startsWith("architect_handoff")) return "handoff";
  if (t.startsWith("execution_checkpoint") || t.startsWith("execution_lifecycle")) return "lifecycle";
  return "other";
}

/**
 * @param {unknown} ev
 * @param {number} tieIndex
 * @returns {{ timestamp: string, event: string, subtask_id: string|null, state: string, _sort: string, _key: string }|null}
 */
function timelineRowFromDiagnosticEvent(ev, tieIndex) {
  if (!ev || typeof ev !== "object" || Array.isArray(ev)) return null;
  const e = /** @type {Record<string, unknown>} */ (ev);
  const typ = String(e.type || "");
  if (!typ || typ.startsWith("observability_")) return null;
  const ts = String(e.recorded_at || "").trim();
  if (!isRoughIsoTimestamp(ts)) return null;
  const pl = e.payload && typeof e.payload === "object" && !Array.isArray(e.payload)
    ? /** @type {Record<string, unknown>} */ (e.payload)
    : null;
  let sid = pl && pl.subtask_id != null ? String(pl.subtask_id).trim() : "";
  if (!/^\d{3}$/.test(sid)) sid = "";
  const state =
    pl && pl.execution_state != null
      ? String(pl.execution_state)
      : pl && pl.status != null
        ? String(pl.status)
        : pl && pl.validation_state != null
          ? String(pl.validation_state)
          : pl && pl.review_state != null
            ? String(pl.review_state)
            : typ;
  const cat = mapEventToTimelineCategory(typ);
  const key = `${ts}\t${typ}\t${sid || "-"}\t${tieIndex}`;
  const sortPad = String(tieIndex).padStart(8, "0");
  return {
    timestamp: ts,
    event: cat,
    subtask_id: sid || null,
    state: String(state || "").slice(0, 200),
    _sort: `${ts}\t${sortPad}\t${typ}\t${sid || "-"}`,
    _key: key,
  };
}

/**
 * @param {typeof timelineRowFromDiagnosticEvent extends (...a: infer R) => infer R ? R : never} rows
 */
function sortTimelineStable(rows) {
  return [...rows].sort((a, b) => (a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : 0));
}

/**
 * @param {string} execDir
 * @param {Record<string, unknown>} session
 * @param {string} outputDirAbs
 * @param {{ orderDoc: Record<string, unknown> }} loaded
 * @returns {string[]}
 */
function collectArtifactRefs(execDir, session, outputDirAbs, loaded) {
  /** @type {string[]} */
  const out = [];
  const pushIf = (rel) => {
    const p = path.join(outputDirAbs, rel.replace(/\//g, path.sep));
    try {
      if (fs.existsSync(p)) out.push(rel.replace(/\\/g, "/"));
    } catch {
      /* ignorar */
    }
  };

  pushIf(`${EXECUTION_DIRNAME}/${SESSION_FILE}`);
  pushIf(`${EXECUTION_DIRNAME}/${DIAGNOSTICS_FILE}`);
  pushIf(`${EXECUTION_DIRNAME}/${OBSERVABILITY_FILE}`);
  pushIf(`${EXECUTION_DIRNAME}/${LIFECYCLE_FILENAME}`);
  pushIf(`${EXECUTION_DIRNAME}/${ROLLBACK_DIRNAME}/${ROLLBACK_STATE_FILENAME}`);

  const resultsDir = path.join(execDir, RESULTS_DIRNAME);
  try {
    if (fs.existsSync(resultsDir) && fs.statSync(resultsDir).isDirectory()) {
      for (const f of fs.readdirSync(resultsDir)) {
        if (!/^\d{3}-(execution-result|patch-validation|execution-review|correction-loop)\.json$/i.test(f)) continue;
        pushIf(`${EXECUTION_DIRNAME}/${RESULTS_DIRNAME}/${f}`);
      }
    }
  } catch {
    /* ignorar */
  }

  const rbRoot = path.join(execDir, ROLLBACK_DIRNAME);
  try {
    if (fs.existsSync(rbRoot) && fs.statSync(rbRoot).isDirectory()) {
      for (const f of fs.readdirSync(rbRoot)) {
        if (!/^\d{3}-snapshot\.json$/i.test(f)) continue;
        pushIf(`${EXECUTION_DIRNAME}/${ROLLBACK_DIRNAME}/${f}`);
      }
    }
  } catch {
    /* ignorar */
  }

  const rows = orderedSubtaskRows(loaded.orderDoc);
  for (const row of rows) {
    const fn = subtaskExecutionFilename(row.subtask_id);
    if (fn) pushIf(`${EXECUTION_DIRNAME}/${SUBTASKS_DIRNAME}/${fn}`);
  }

  return [...new Set(out)].sort();
}

/**
 * @param {string} execDir
 * @param {{ orderDoc: Record<string, unknown> }} loaded
 * @param {Record<string, unknown>} session
 * @returns {{ subtask_id: string, execution_state: string, observability_state?: unknown, last_observability_update?: unknown }[]}
 */
function buildSubtasksSummary(execDir, loaded, session) {
  const rows = orderedSubtaskRows(loaded.orderDoc);
  /** @type {{ subtask_id: string, execution_state: string, observability_state?: unknown, last_observability_update?: unknown }[]} */
  const out = [];
  for (const row of rows) {
    const fn = subtaskExecutionFilename(row.subtask_id);
    if (!fn) continue;
    const fp = path.join(execDir, SUBTASKS_DIRNAME, fn);
    const doc = readJsonObject(fp);
    const ex = doc ? String(doc.execution_state || "") : "";
    out.push({
      subtask_id: row.subtask_id,
      execution_state: ex,
      observability_state: doc ? doc.observability_state : undefined,
      last_observability_update: doc ? doc.last_observability_update : undefined,
    });
  }
  void session;
  return out;
}

/**
 * @param {string} execDir
 * @param {{ orderDoc: Record<string, unknown> }} loaded
 * @returns {{ warnings: string[], errors: string[] }}
 */
function aggregateWarningsErrors(execDir, loaded) {
  /** @type {Set<string>} */
  const warn = new Set();
  /** @type {Set<string>} */
  const err = new Set();
  const rows = orderedSubtaskRows(loaded.orderDoc);

  const take = (arr, lim, bucket) => {
    if (!Array.isArray(arr)) return;
    for (const x of arr) {
      const s = typeof x === "string" ? x.trim() : JSON.stringify(x);
      if (!s) continue;
      bucket.add(s);
      if (bucket.size >= lim) return;
    }
  };

  for (const row of rows) {
    const pvf = patchValidationFilename(row.subtask_id);
    if (pvf) {
      const pv = readJsonObject(path.join(execDir, RESULTS_DIRNAME, pvf));
      if (pv) {
        take(pv.warnings, MAX_WARNINGS_LIST, warn);
        take(pv.errors, MAX_ERRORS_LIST, err);
      }
    }
    const rvf = executionReviewFilename(row.subtask_id);
    if (rvf) {
      const rv = readJsonObject(path.join(execDir, RESULTS_DIRNAME, rvf));
      if (rv) {
        take(rv.warnings, MAX_WARNINGS_LIST, warn);
        take(rv.errors, MAX_ERRORS_LIST, err);
      }
    }
    const clf = correctionLoopFilename(row.subtask_id);
    if (clf) {
      const cl = readJsonObject(path.join(execDir, RESULTS_DIRNAME, clf));
      if (cl) {
        take(cl.warnings, MAX_WARNINGS_LIST, warn);
        take(cl.errors, MAX_ERRORS_LIST, err);
      }
    }
    const erf = executionResultFilename(row.subtask_id);
    if (erf) {
      const er = readJsonObject(path.join(execDir, RESULTS_DIRNAME, erf));
      if (er) {
        take(er.warnings, MAX_WARNINGS_LIST, warn);
        take(er.errors, MAX_ERRORS_LIST, err);
      }
    }
  }

  return {
    warnings: [...warn].slice(0, MAX_WARNINGS_LIST),
    errors: [...err].slice(0, MAX_ERRORS_LIST),
  };
}

/**
 * @param {{ type: string, recorded_at?: string, payload?: Record<string, unknown> }[]} events
 */
function lastEventMatching(events, pred) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev && pred(ev)) return ev;
  }
  return null;
}

/**
 * @param {string} execDir
 * @param {Record<string, unknown>} session
 * @param {{ orderDoc: Record<string, unknown> }} loaded
 * @param {{ type: string, recorded_at?: string, payload?: Record<string, unknown> }[]} diagEvents
 * @param {{ timestamp: string, event: string, subtask_id: string|null, state: string, _sort: string, _key: string }[]} timelineRows
 * @param {{ warnings: string[], errors: string[] }} aggWE
 */
function buildTroubleshooting(execDir, session, loaded, diagEvents, timelineRows, aggWE) {
  const evRollback = lastEventMatching(
    diagEvents,
    (e) => String(e.type || "").startsWith("rollback_") && String(e.type || "") !== "rollback_snapshot_created",
  );
  const evRec = lastEventMatching(diagEvents, (e) => e.type === "execution_recovery_started" || e.type === "execution_resumed");

  /** @type {string[]} */
  const failedIds = [];
  const rows = orderedSubtaskRows(loaded.orderDoc);
  for (const row of rows) {
    const fn = subtaskExecutionFilename(row.subtask_id);
    if (!fn) continue;
    const doc = readJsonObject(path.join(execDir, SUBTASKS_DIRNAME, fn));
    const ex = doc ? String(doc.execution_state || "") : "";
    if (
      ex === "execution_failed" ||
      ex === "failed" ||
      ex === "patch_validation_failed" ||
      ex === "review_failed" ||
      ex === "correction_failed" ||
      ex === "retry_exhausted"
    ) {
      failedIds.push(row.subtask_id);
    }
  }

  const lastErrEv = lastEventMatching(
    diagEvents,
    (e) =>
      String(e.type || "").includes("failed") ||
      e.type === "rollback_failed" ||
      e.type === "correction_failed",
  );

  return {
    top_warnings: aggWE.warnings.slice(0, 15),
    last_error: lastErrEv
      ? {
          type: String(lastErrEv.type || ""),
          timestamp: String(lastErrEv.recorded_at || ""),
          message:
            lastErrEv.payload && typeof lastErrEv.payload === "object" && !Array.isArray(lastErrEv.payload)
              ? String(
                  /** @type {Record<string, unknown>} */ (lastErrEv.payload).message ||
                    /** @type {Record<string, unknown>} */ (lastErrEv.payload).code ||
                    "",
                )
              : "",
        }
      : null,
    last_rollback: evRollback
      ? {
          type: String(evRollback.type || ""),
          timestamp: String(evRollback.recorded_at || ""),
          subtask_id:
            evRollback.payload &&
            typeof evRollback.payload === "object" &&
            !Array.isArray(evRollback.payload) &&
            /** @type {Record<string, unknown>} */ (evRollback.payload).subtask_id != null
              ? String(/** @type {Record<string, unknown>} */ (evRollback.payload).subtask_id)
              : null,
        }
      : null,
    last_recovery: evRec
      ? {
          type: String(evRec.type || ""),
          timestamp: String(evRec.recorded_at || ""),
        }
      : null,
    failed_subtask_ids: failedIds,
    session_execution_state: String(session.execution_state || ""),
  };
}

/**
 * @param {Record<string, unknown>|null} obs
 */
function isExistingObservabilityUsable(obs) {
  if (!obs || typeof obs !== "object" || Array.isArray(obs)) return false;
  if (Number(obs.version) !== 1) return false;
  if (!isAcceptedBundlePhase(obs.phase)) return false;
  if (!Array.isArray(obs.timeline)) return false;
  if (!obs.diagnostics || typeof obs.diagnostics !== "object" || Array.isArray(obs.diagnostics)) return false;
  return true;
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   force?: boolean,
 *   recordDiagnosticEvents?: boolean,
 * }} p
 * @returns {{ ok: true, skipped?: boolean, path: string } | { ok: false, error: { code: string, message: string } }}
 */
function buildExecutionObservability(p) {
  const root = path.resolve(String(p.outputDirAbs || ""));
  const execDir = path.join(root, EXECUTION_DIRNAME);
  const sessionPath = path.join(execDir, SESSION_FILE);
  const diagPath = path.join(execDir, DIAGNOSTICS_FILE);
  const outPath = path.join(execDir, OBSERVABILITY_FILE);
  const force = p.force === true;
  const recordDiagnosticEvents = p.recordDiagnosticEvents !== false;

  if (!fs.existsSync(sessionPath) || !fs.existsSync(diagPath)) {
    return {
      ok: false,
      error: { code: "OBSERVABILITY_PREREQ", message: "execution-session.json ou execution-diagnostics.json em falta." },
    };
  }

  const session = readJsonObject(sessionPath);
  const diag = readJsonObject(diagPath);
  if (!session || !diag) {
    return { ok: false, error: { code: "OBSERVABILITY_JSON", message: "JSON inválido em session ou diagnostics." } };
  }

  const loaded = loadHandoffAndOrderForExecution(root);
  if (!loaded.ok) {
    return {
      ok: false,
      error: loaded.error || { code: "OBSERVABILITY_HANDOFF", message: "Handoff inválido." },
    };
  }

  let diagEvents = Array.isArray(diag.events)
    ? /** @type {{ type: string, recorded_at?: string, payload?: Record<string, unknown> }[]} */ (diag.events)
    : [];

  if (force && recordDiagnosticEvents) {
    const stripped = stripObservabilityDiagnosticEvents(diagEvents);
    if (stripped.length !== diagEvents.length) {
      diagEvents = stripped;
      diag.events = diagEvents;
      fs.writeFileSync(diagPath, JSON.stringify(diag, null, 2), "utf-8");
    }
  }

  const prevObs = !force ? readJsonObject(outPath) : null;
  const prevApplied =
    prevObs &&
    prevObs.incremental &&
    typeof prevObs.incremental === "object" &&
    !Array.isArray(prevObs.incremental) &&
    /** @type {Record<string, unknown>} */ (prevObs.incremental).diagnostic_events_applied != null
      ? Number(/** @type {Record<string, unknown>} */ (prevObs.incremental).diagnostic_events_applied)
      : -1;

  if (
    !force &&
    isExistingObservabilityUsable(prevObs) &&
    Number.isInteger(prevApplied) &&
    prevApplied === diagEvents.length
  ) {
    const sessMut = /** @type {Record<string, unknown>} */ ({ ...session });
    sessMut.observability_ready = true;
    sessMut.diagnostics_events_total = diagEvents.length;
    sessMut.timeline_events_total = Array.isArray(prevObs.timeline) ? prevObs.timeline.length : 0;
    fs.writeFileSync(sessionPath, JSON.stringify(sessMut, null, 2), "utf-8");
    return { ok: true, skipped: true, path: outPath.replace(/\\/g, "/") };
  }

  /** @type {Map<string, { timestamp: string, event: string, subtask_id: string|null, state: string, _sort: string, _key: string }>} */
  const merged = new Map();
  if (!force && prevObs && Array.isArray(prevObs.timeline)) {
    for (const raw of prevObs.timeline) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const o = /** @type {Record<string, unknown>} */ (raw);
      const ts = String(o.timestamp || "");
      const ev = String(o.event || "");
      const sid = o.subtask_id == null ? null : String(o.subtask_id);
      const st = String(o.state || "");
      if (!isRoughIsoTimestamp(ts)) continue;
      const key = `${ts}\t${ev}\t${sid || "-"}\t${st}`;
      merged.set(key, {
        timestamp: ts,
        event: ev,
        subtask_id: sid && /^\d{3}$/.test(sid) ? sid : null,
        state: st,
        _sort: `${ts}\t00000000\t${ev}\t${sid || "-"}`,
        _key: key,
      });
    }
  }

  const startIdx = !force && prevApplied >= 0 ? prevApplied : 0;
  for (let i = startIdx; i < diagEvents.length; i++) {
    const row = timelineRowFromDiagnosticEvent(diagEvents[i], i);
    if (row) merged.set(row._key, row);
  }

  let sorted = sortTimelineStable([...merged.values()]);
  if (sorted.length > MAX_TIMELINE_EVENTS) {
    sorted = sorted.slice(sorted.length - MAX_TIMELINE_EVENTS);
  }

  const timeline = sorted.map(({ timestamp, event, subtask_id, state }) => ({
    timestamp,
    event,
    subtask_id,
    state,
  }));

  const aggWE = aggregateWarningsErrors(execDir, loaded);
  const sumDiag =
    diag.summary && typeof diag.summary === "object" && !Array.isArray(diag.summary)
      ? /** @type {Record<string, unknown>} */ (diag.summary)
      : null;
  const resumeOps = Number(sumDiag && sumDiag.resumed_sessions != null ? sumDiag.resumed_sessions : 0) || 0;

  const runtimeSummary = {
    execution_state: String(session.execution_state || ""),
    total_subtasks: Number(session.total_subtasks) || 0,
    completed_subtasks: Number(session.completed_subtasks) || 0,
    failed_subtasks: Number(session.failed_subtasks) || 0,
    corrected_subtasks: Number(session.corrected_subtasks) || 0,
    rollback_operations: Number(session.rollback_operations) || 0,
    resume_operations: Number.isFinite(resumeOps) ? resumeOps : 0,
  };

  const troubleshooting = buildTroubleshooting(execDir, session, loaded, diagEvents, sorted, aggWE);

  const artifacts = collectArtifactRefs(execDir, session, root, loaded);
  const subtasks = buildSubtasksSummary(execDir, loaded, session);

  const iso = () => new Date().toISOString();
  const nowIso = iso();

  if (recordDiagnosticEvents) {
    const baseLen = diagEvents.length;
    diagEvents.push({
      type: "observability_started",
      recorded_at: iso(),
      payload: {
        total_events: baseLen,
        total_warnings: aggWE.warnings.length,
        total_errors: aggWE.errors.length,
        total_subtasks: runtimeSummary.total_subtasks,
      },
    });
    diagEvents.push({
      type: "observability_aggregated",
      recorded_at: iso(),
      payload: {
        total_events: baseLen + 1,
        total_warnings: aggWE.warnings.length,
        total_errors: aggWE.errors.length,
        total_subtasks: runtimeSummary.total_subtasks,
      },
    });
    diagEvents.push({
      type: "observability_completed",
      recorded_at: iso(),
      payload: {
        total_events: baseLen + 2,
        total_warnings: aggWE.warnings.length,
        total_errors: aggWE.errors.length,
        total_subtasks: runtimeSummary.total_subtasks,
      },
    });
    diag.events = diagEvents;
    fs.writeFileSync(diagPath, JSON.stringify(diag, null, 2), "utf-8");
  }

  const finalLen = diagEvents.length;
  const obsDoc = {
    version: 1,
    phase: OBS_PHASE,
    status: OBS_STATUS,
    generated_at: nowIso,
    runtime_summary: runtimeSummary,
    timeline,
    diagnostics: {
      warnings: aggWE.warnings,
      errors: aggWE.errors,
      events_total: finalLen,
    },
    troubleshooting,
    artifacts,
    subtasks,
    incremental: {
      diagnostic_events_applied: finalLen,
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(obsDoc, null, 2), "utf-8");

  const rows = orderedSubtaskRows(loaded.orderDoc);
  for (const row of rows) {
    const fn = subtaskExecutionFilename(row.subtask_id);
    if (!fn) continue;
    const fp = path.join(execDir, SUBTASKS_DIRNAME, fn);
    const doc = readJsonObject(fp);
    if (!doc) continue;
    const d = /** @type {Record<string, unknown>} */ ({ ...doc });
    d.observability_state = "aggregated";
    d.last_observability_update = nowIso;
    fs.writeFileSync(fp, JSON.stringify(d, null, 2), "utf-8");
  }

  const sess = /** @type {Record<string, unknown>} */ ({ ...session });
  sess.observability_ready = true;
  sess.diagnostics_events_total = diagEvents.length;
  sess.timeline_events_total = timeline.length;
  fs.writeFileSync(sessionPath, JSON.stringify(sess, null, 2), "utf-8");

  return { ok: true, path: outPath.replace(/\\/g, "/") };
}

module.exports = {
  OBSERVABILITY_FILE,
  OBS_PHASE,
  OBS_STATUS,
  MAX_TIMELINE_EVENTS,
  buildExecutionObservability,
  mapEventToTimelineCategory,
  timelineRowFromDiagnosticEvent,
  isRoughIsoTimestamp,
};
