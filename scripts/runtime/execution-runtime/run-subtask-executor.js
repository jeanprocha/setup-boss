"use strict";

const fs = require("fs");
const path = require("path");

const { readJsonObject } = require("./build-execution-session");
const {
  subtaskExecutionFilename,
  orderedSubtaskRows,
  SUBTASK_PHASE,
} = require("./build-subtask-execution-state");
const { architectHandoffFilename, pathHasWildcard } = require("./build-architect-handoff");

const EXECUTION_RESULTS_REL = "execution/results";
const MARKER_LINE = "// setup-boss:executor-mvp-marker\n";

/**
 * @param {string} subtaskId
 */
function executionResultFilename(subtaskId) {
  const id = String(subtaskId || "").trim();
  return /^\d{3}$/.test(id) ? `${id}-execution-result.json` : "";
}

/**
 * @param {string} rootAbs
 * @param {string} rel
 * @returns {string}
 */
function resolveScopedFile(rootAbs, rel) {
  const norm = String(rel || "").trim().replace(/\\/g, "/");
  if (!norm) throw new Error("SCOPE_EMPTY_PATH");
  if (pathHasWildcard(norm)) throw new Error("SCOPE_WILDCARD");
  const abs = path.resolve(rootAbs, norm.replace(/\//g, path.sep));
  const root = path.resolve(rootAbs);
  const relPart = path.relative(root, abs);
  if (relPart.startsWith("..") || path.isAbsolute(relPart)) {
    throw new Error("SCOPE_OUTSIDE_ROOT");
  }
  return abs;
}

/**
 * @param {string[]} modified
 * @param {string[]} allowed
 * @returns {{ ok: boolean, unexpected: string[] }}
 */
function validateModifiedInAllowed(modified, allowed) {
  const allow = new Set(allowed.map((x) => String(x || "").trim().replace(/\\/g, "/")));
  /** @type {string[]} */
  const unexpected = [];
  for (const m of modified) {
    const t = String(m || "").trim().replace(/\\/g, "/");
    if (!t || pathHasWildcard(t)) return { ok: false, unexpected: [...unexpected, t || "(vazio)"] };
    if (!allow.has(t)) unexpected.push(t);
  }
  return { ok: unexpected.length === 0, unexpected };
}

/**
 * @param {unknown} doc
 * @returns {boolean}
 */
function isValidExecutionResultDoc(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) return false;
  if (String(d.phase || "") !== "4.4") return false;
  if (!/^\d{3}$/.test(String(d.subtask_id || "").trim())) return false;
  const st = String(d.status || "");
  if (st !== "completed" && st !== "failed") return false;
  const ex = String(d.execution_state || "");
  if (ex !== "completed" && ex !== "failed") return false;
  if (st !== ex) return false;
  if (!Array.isArray(d.allowed_files)) return false;
  if (!Array.isArray(d.modified_files)) return false;
  if (typeof d.execution_summary !== "string") return false;
  if (!Array.isArray(d.artifacts)) return false;
  const v = d.validation;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const val = /** @type {Record<string, unknown>} */ (v);
  if (typeof val.allowed_scope_respected !== "boolean") return false;
  if (!Array.isArray(val.unexpected_files)) return false;
  return true;
}

/**
 * @param {string} ex
 */
function isDependencySatisfiedState(ex) {
  return ex === "review_completed" || ex === "patch_validated" || ex === "completed";
}

/**
 * @param {string} execDir
 * @param {string} subtaskId
 * @returns {Record<string, unknown>|null}
 */
function readSubtaskExecution(execDir, subtaskId) {
  const fn = subtaskExecutionFilename(subtaskId);
  if (!fn) return null;
  return readJsonObject(path.join(execDir, "subtasks", fn));
}

/**
 * @param {string} outputDirAbs
 * @param {{ orderDoc: Record<string, unknown> }} loaded
 * @returns {string|null}
 */
function findFirstRunnableSubtaskId(outputDirAbs, loaded) {
  const rows = orderedSubtaskRows(loaded.orderDoc);
  const execDir = path.join(outputDirAbs, "execution");
  for (const row of rows) {
    const doc = readSubtaskExecution(execDir, row.subtask_id);
    if (!doc) continue;
    if (String(doc.execution_state || "") !== "handoff_ready") continue;
    const deps = Array.isArray(doc.depends_on) ? doc.depends_on.map((x) => String(x).trim()) : [];
    let ok = true;
    for (const depId of deps) {
      if (!/^\d{3}$/.test(depId)) continue;
      const depDoc = readSubtaskExecution(execDir, depId);
      const dex = depDoc ? String(depDoc.execution_state || "") : "";
      if (!isDependencySatisfiedState(dex)) {
        ok = false;
        break;
      }
    }
    if (ok) return row.subtask_id;
  }
  return null;
}

/**
 * @param {string} outputDirAbs
 * @param {{ orderDoc: Record<string, unknown> }} loaded
 * @param {string} subtaskId
 * @returns {boolean}
 */
function isSubtaskRunnableHandoffReady(outputDirAbs, loaded, subtaskId) {
  const sid = String(subtaskId || "").trim();
  if (!/^\d{3}$/.test(sid)) return false;
  const rows = orderedSubtaskRows(loaded.orderDoc);
  if (!rows.some((r) => r.subtask_id === sid)) return false;
  const execDir = path.join(outputDirAbs, "execution");
  const doc = readSubtaskExecution(execDir, sid);
  if (!doc || String(doc.execution_state || "") !== "handoff_ready") return false;
  const deps = Array.isArray(doc.depends_on) ? doc.depends_on.map((x) => String(x).trim()) : [];
  for (const depId of deps) {
    if (!/^\d{3}$/.test(depId)) continue;
    const depDoc = readSubtaskExecution(execDir, depId);
    const dex = depDoc ? String(depDoc.execution_state || "") : "";
    if (!isDependencySatisfiedState(dex)) return false;
  }
  return true;
}

/**
 * @param {string} outputDirAbs
 * @param {{ orderDoc: Record<string, unknown> }} loaded
 * @returns {boolean}
 */
function hasRunnableHandoffReady(outputDirAbs, loaded) {
  return findFirstRunnableSubtaskId(outputDirAbs, loaded) != null;
}

/**
 * MVP: altera no máximo o primeiro ficheiro em allowed_files (append de linha marcador).
 *
 * @param {{
 *   outputDirAbs: string,
 *   execDir: string,
 *   loaded: { orderDoc: Record<string, unknown>, subtaskRels: string[] },
 *   force: boolean,
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 *   target_subtask_id?: string,
 *   lifecycleCtx?: { loaded: { orderDoc: Record<string, unknown> } },
 * }} p
 */
function runSingleSubtaskExecutorMvp(p) {
  const { outputDirAbs, execDir, loaded, force, events, iso } = p;
  const resultsDir = path.join(execDir, "results");
  if (force && fs.existsSync(resultsDir)) {
    fs.rmSync(resultsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(resultsDir, { recursive: true });

  const targetRaw = p.target_subtask_id != null ? String(p.target_subtask_id).trim() : "";
  /** @type {string|null} */
  let sid = null;
  if (/^\d{3}$/.test(targetRaw)) {
    if (!isSubtaskRunnableHandoffReady(outputDirAbs, loaded, targetRaw)) {
      return {
        ran: false,
        subtask_id: targetRaw,
        outcome: "skipped",
        artifacts: [],
        modified_files: [],
        modified_files_total: 0,
      };
    }
    sid = targetRaw;
  } else {
    sid = findFirstRunnableSubtaskId(outputDirAbs, loaded);
  }
  if (!sid) {
    return {
      ran: false,
      subtask_id: null,
      outcome: "skipped",
      artifacts: [],
      modified_files: [],
      modified_files_total: 0,
    };
  }

  const hfn = architectHandoffFilename(sid);
  const hpath = path.join(execDir, "handoffs", hfn);
  const handoff = readJsonObject(hpath);
  if (!handoff || !Array.isArray(handoff.allowed_files)) {
    return failExecutor({
      execDir,
      outputDirAbs,
      sid,
      resultsDir,
      events,
      iso,
      reason: "HANDOFF_MISSING",
      allowed_files: [],
    });
  }

  const allowed_files = handoff.allowed_files.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/")).filter(Boolean);
  for (const f of allowed_files) {
    if (pathHasWildcard(f)) {
      return failExecutor({
        execDir,
        outputDirAbs,
        sid,
        resultsDir,
        events,
        iso,
        reason: "ALLOWED_HAS_WILDCARD",
        allowed_files,
      });
    }
  }

  const resFn = executionResultFilename(sid);
  const resPath = path.join(resultsDir, resFn);

  const startedAt = iso();
  if (p.lifecycleCtx && p.lifecycleCtx.loaded) {
    const { saveExecutionCheckpoint } = require("./manage-execution-lifecycle");
    saveExecutionCheckpoint({
      execDir,
      outputDirAbs,
      loaded: p.lifecycleCtx.loaded,
      subtaskId: sid,
      lifecycleState: "running",
      recoveryState: "pre_subtask_execution",
      events,
      iso,
    });
  }
  const { createPreExecutionSnapshot } = require("./manage-execution-rollback");
  createPreExecutionSnapshot({
    outputDirAbs,
    execDir,
    subtaskId: sid,
    allowed_files,
    force,
    events,
    iso,
  });
  writeSubtaskExecutionState(execDir, sid, {
    status: "executing",
    execution_state: "executing",
    phase: SUBTASK_PHASE,
    updated_at: startedAt,
  });

  const { tryTransitionMiniActivityForSubtask } = require("../../../core/update-execution-runtime-state");
  tryTransitionMiniActivityForSubtask(outputDirAbs, {
    subtaskId: sid,
    toStatus: "running",
    reason: "subtask_execution_started",
    executionRef: path
      .join("execution", "subtasks", subtaskExecutionFilename(sid) || "")
      .replace(/\\/g, "/"),
    subtaskRef: sid,
  });

  events.push({
    type: "subtask_execution_started",
    recorded_at: iso(),
    payload: { subtask_id: sid, modified_files_count: 0, execution_state: "executing" },
  });

  /** @type {string[]} */
  const modified_files = [];
  try {
    if (allowed_files.length === 0) {
      /* no-op MVP */
    } else {
      const targetRel = allowed_files[0];
      const abs = resolveScopedFile(outputDirAbs, targetRel);
      const dir = path.dirname(abs);
      fs.mkdirSync(dir, { recursive: true });
      const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : "";
      if (!prev.includes(MARKER_LINE.trim())) {
        fs.writeFileSync(abs, prev + (prev && !prev.endsWith("\n") ? "\n" : "") + MARKER_LINE, "utf-8");
      }
      modified_files.push(targetRel.replace(/\\/g, "/"));
    }

    const scope = validateModifiedInAllowed(modified_files, allowed_files);
    if (!scope.ok) {
      throw new Error("MODIFIED_OUTSIDE_ALLOWED");
    }

    const completedAt = iso();
    const resultDoc = {
      version: 1,
      phase: "4.4",
      subtask_id: sid,
      status: "completed",
      execution_state: "completed",
      started_at: startedAt,
      completed_at: completedAt,
      allowed_files,
      modified_files,
      execution_summary: `MVP: ${modified_files.length} ficheiro(s) tocado(s).`,
      artifacts: [`${EXECUTION_RESULTS_REL}/${resFn}`.replace(/\\/g, "/")],
      validation: {
        allowed_scope_respected: true,
        unexpected_files: [],
      },
    };
    fs.writeFileSync(resPath, JSON.stringify(resultDoc, null, 2), "utf-8");

    writeSubtaskExecutionState(execDir, sid, {
      status: "execution_completed",
      execution_state: "execution_completed",
      phase: SUBTASK_PHASE,
      updated_at: completedAt,
    });

    events.push({
      type: "subtask_execution_completed",
      recorded_at: iso(),
      payload: {
        subtask_id: sid,
        modified_files_count: modified_files.length,
        execution_state: "execution_completed",
      },
    });

    return {
      ran: true,
      subtask_id: sid,
      outcome: "completed",
      artifacts: [`${EXECUTION_RESULTS_REL}/${resFn}`.replace(/\\/g, "/")],
      modified_files,
      modified_files_total: modified_files.length,
    };
  } catch {
    return failExecutor({
      execDir,
      outputDirAbs,
      sid,
      resultsDir,
      events,
      iso,
      reason: "EXECUTION_APPLY_FAILED",
      allowed_files,
      startedAt,
      modified_files,
    });
  }
}

/**
 * @param {{
 *   execDir: string,
 *   outputDirAbs: string,
 *   sid: string,
 *   resultsDir: string,
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 *   reason: string,
 *   allowed_files: string[],
 *   startedAt?: string,
 *   modified_files?: string[],
 * }} p
 */
function failExecutor(p) {
  const { execDir, outputDirAbs, sid, resultsDir, events, iso, reason, allowed_files, startedAt, modified_files } = p;
  const started = startedAt || iso();
  const completedAt = iso();
  const resFn = executionResultFilename(sid);
  const resPath = path.join(resultsDir, resFn);
  const mod = modified_files || [];
  const unexpected = mod.filter((m) => !allowed_files.includes(m));
  const resultDoc = {
    version: 1,
    phase: "4.4",
    subtask_id: sid,
    status: "failed",
    execution_state: "failed",
    started_at: started,
    completed_at: completedAt,
    allowed_files,
    modified_files: mod,
    execution_summary: `Falha: ${reason}`,
    artifacts: [`${EXECUTION_RESULTS_REL}/${resFn}`.replace(/\\/g, "/")],
    validation: {
      allowed_scope_respected: unexpected.length === 0,
      unexpected_files: unexpected,
    },
  };
  fs.writeFileSync(resPath, JSON.stringify(resultDoc, null, 2), "utf-8");

  writeSubtaskExecutionState(execDir, sid, {
    status: "execution_failed",
    execution_state: "execution_failed",
    phase: SUBTASK_PHASE,
    updated_at: completedAt,
  });

  const { tryTransitionMiniActivityForSubtask } = require("../../../core/update-execution-runtime-state");
  tryTransitionMiniActivityForSubtask(outputDirAbs, {
    subtaskId: sid,
    toStatus: "failed",
    reason: reason || "subtask_execution_failed",
    subtaskRef: sid,
  });

  events.push({
    type: "subtask_execution_failed",
    recorded_at: iso(),
    payload: {
      subtask_id: sid,
      modified_files_count: mod.length,
      execution_state: "execution_failed",
    },
  });

  const { tryAutoRollbackAfterFailure } = require("./manage-execution-rollback");
  tryAutoRollbackAfterFailure({
    outputDirAbs,
    execDir,
    subtaskId: sid,
    trigger: "execution_failed",
    modified_files: mod,
    allowed_files,
    events,
    iso,
  });

  return {
    ran: true,
    subtask_id: sid,
    outcome: "failed",
    artifacts: [`${EXECUTION_RESULTS_REL}/${resFn}`.replace(/\\/g, "/")],
    modified_files: mod,
    modified_files_total: 0,
  };
}

/**
 * @param {string} execDir
 * @param {string} subtaskId
 * @param {{ status: string, execution_state: string, phase: string, updated_at: string }} upd
 */
function writeSubtaskExecutionState(execDir, subtaskId, upd) {
  const fn = subtaskExecutionFilename(subtaskId);
  const fp = path.join(execDir, "subtasks", fn);
  const doc = readJsonObject(fp);
  if (!doc) return;
  const d = /** @type {Record<string, unknown>} */ (doc);
  d.status = upd.status;
  d.execution_state = upd.execution_state;
  d.updated_at = upd.updated_at;
  d.phase = upd.phase;
  fs.writeFileSync(fp, JSON.stringify(d, null, 2), "utf-8");
}

/**
 * @param {string} outputDirAbs
 * @returns {number}
 */
function sumModifiedFilesFromResults(outputDirAbs) {
  const dir = path.join(outputDirAbs, "execution", "results");
  if (!fs.existsSync(dir)) return 0;
  let sum = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!/^\d{3}-execution-result\.json$/i.test(name)) continue;
    const j = readJsonObject(path.join(dir, name));
    if (j && Array.isArray(j.modified_files)) sum += j.modified_files.length;
  }
  return sum;
}

module.exports = {
  EXECUTION_RESULTS_REL,
  executionResultFilename,
  resolveScopedFile,
  validateModifiedInAllowed,
  isValidExecutionResultDoc,
  findFirstRunnableSubtaskId,
  isSubtaskRunnableHandoffReady,
  hasRunnableHandoffReady,
  runSingleSubtaskExecutorMvp,
  sumModifiedFilesFromResults,
};
