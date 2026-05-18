"use strict";

const fs = require("fs");
const path = require("path");

const { readJsonObject } = require("./build-execution-session");
const { subtaskExecutionFilename, orderedSubtaskRows } = require("./build-subtask-execution-state");
const { pathHasWildcard, architectHandoffFilename } = require("./build-architect-handoff");
const { validatePathShape } = require("./validate-execution-patch");
const { MVP_EXECUTION_PHASE } = require("./execution-mvp-contract");

const ROLLBACK_PHASE = MVP_EXECUTION_PHASE;
const ROLLBACK_DIRNAME = "rollback";
const ROLLBACK_STATE_FILENAME = "rollback-state.json";
const BACKUPS_DIRNAME = "backups";
const LIFECYCLE_FILENAME = "execution-lifecycle.json";

/** @type {ReadonlySet<string>} */
const ROLLBACK_STATE_VALUES = new Set([
  "none",
  "snapshotting",
  "rollback_available",
  "rolling_back",
  "rollback_completed",
  "rollback_failed",
]);

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
 * @param {string} execDir
 */
function rollbackRoot(execDir) {
  return path.join(execDir, ROLLBACK_DIRNAME);
}

/**
 * @param {string} execDir
 */
function rollbackStatePath(execDir) {
  return path.join(rollbackRoot(execDir), ROLLBACK_STATE_FILENAME);
}

/**
 * @param {string} execDir
 * @param {string} subtaskId
 */
function snapshotFilePath(execDir, subtaskId) {
  const sid = String(subtaskId || "").trim();
  return /^\d{3}$/.test(sid) ? path.join(rollbackRoot(execDir), `${sid}-snapshot.json`) : "";
}

/**
 * @param {string} execDir
 * @param {string} subtaskId
 */
function backupDirForSubtask(execDir, subtaskId) {
  const sid = String(subtaskId || "").trim();
  return /^\d{3}$/.test(sid) ? path.join(rollbackRoot(execDir), BACKUPS_DIRNAME, sid) : "";
}

/**
 * @returns {Record<string, unknown>}
 */
function createInitialRollbackState() {
  return {
    version: 1,
    phase: ROLLBACK_PHASE,
    status: "rollback_ready",
    rollback_enabled: true,
    snapshots_created: 0,
    rollback_operations: 0,
    rollback_failures: 0,
    last_rollback_at: null,
    tracked_subtasks: /** @type {string[]} */ ([]),
    tracked_files: /** @type {string[]} */ ([]),
  };
}

/**
 * @param {string} execDir
 * @param {boolean} force
 */
function initRollbackStateFile(execDir, force) {
  const rbRoot = rollbackRoot(execDir);
  fs.mkdirSync(rbRoot, { recursive: true });
  const p = rollbackStatePath(execDir);
  if (force && fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(createInitialRollbackState(), null, 2), "utf-8");
    return readJsonObject(p);
  }
  let doc = readJsonObject(p);
  if (!doc || Number(doc.version) !== 1) {
    doc = /** @type {Record<string, unknown>} */ (createInitialRollbackState());
    fs.writeFileSync(p, JSON.stringify(doc, null, 2), "utf-8");
  } else if (String(doc.phase || "") !== ROLLBACK_PHASE) {
    doc = { ...doc, phase: ROLLBACK_PHASE };
    fs.writeFileSync(p, JSON.stringify(doc, null, 2), "utf-8");
  }
  return doc;
}

/**
 * @param {string} execDir
 * @param {Record<string, unknown>} doc
 */
function writeRollbackState(execDir, doc) {
  fs.mkdirSync(rollbackRoot(execDir), { recursive: true });
  fs.writeFileSync(rollbackStatePath(execDir), JSON.stringify(doc, null, 2), "utf-8");
}

/**
 * @param {string} execDir
 * @param {string} subtaskId
 * @param {Record<string, unknown>} patch
 */
function mergeRollbackIntoSubtask(execDir, subtaskId, patch) {
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
 * @param {string} rel
 * @param {Set<string>} allowedSet
 * @returns {string|null} código de erro ou null
 */
function assertRollbackPathSafe(rel, allowedSet) {
  const t = String(rel || "").trim().replace(/\\/g, "/");
  if (!t) return "EMPTY";
  if (pathHasWildcard(t)) return "WILDCARD";
  const shape = validatePathShape(t);
  if (shape) return shape;
  if (!allowedSet.has(t)) return "NOT_ALLOWED";
  return null;
}

/**
 * Cria snapshot físico antes da execução da subtask (allowed_files existentes).
 *
 * @param {{
 *   outputDirAbs: string,
 *   execDir: string,
 *   subtaskId: string,
 *   allowed_files: string[],
 *   force: boolean,
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 * }} p
 * @returns {{ skipped: boolean, tracked_files: string[], backup_refs: { rel: string, backup_rel: string }[] }}
 */
function createPreExecutionSnapshot(p) {
  const { outputDirAbs, execDir, subtaskId, allowed_files, force, events, iso } = p;
  const sid = String(subtaskId || "").trim();
  if (!/^\d{3}$/.test(sid)) {
    return { skipped: true, tracked_files: [], backup_refs: [] };
  }

  const snapPath = snapshotFilePath(execDir, sid);
  if (!snapPath) return { skipped: true, tracked_files: [], backup_refs: [] };

  const existingSnap = !force && fs.existsSync(snapPath) ? readJsonObject(snapPath) : null;
  if (
    existingSnap &&
    String(existingSnap.snapshot_state || "") === "created" &&
    existingSnap.rollback_available === true &&
    !force
  ) {
    mergeRollbackIntoSubtask(execDir, sid, {
      rollback_state: "rollback_available",
    });
    return {
      skipped: true,
      tracked_files: Array.isArray(existingSnap.tracked_files)
        ? /** @type {string[]} */ (existingSnap.tracked_files.map((x) => String(x).replace(/\\/g, "/")))
        : [],
      backup_refs: Array.isArray(existingSnap.backup_refs) ? /** @type {{ rel: string, backup_rel: string }[]} */ (existingSnap.backup_refs) : [],
    };
  }

  initRollbackStateFile(execDir, false);
  const rb = readJsonObject(rollbackStatePath(execDir));
  const rbDoc = rb && typeof rb === "object" && !Array.isArray(rb) ? /** @type {Record<string, unknown>} */ ({ ...rb }) : createInitialRollbackState();

  mergeRollbackIntoSubtask(execDir, sid, {
    rollback_state: "snapshotting",
    snapshot_created_at: null,
    rollback_completed_at: null,
  });

  const backupAbsRoot = backupDirForSubtask(execDir, sid);
  if (!backupAbsRoot) return { skipped: true, tracked_files: [], backup_refs: [] };

  if (force && fs.existsSync(backupAbsRoot)) {
    fs.rmSync(backupAbsRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(backupAbsRoot, { recursive: true });

  const allowSet = new Set(allowed_files.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/")).filter(Boolean));
  /** @type {string[]} */
  const tracked_files = [];
  /** @type {{ rel: string, backup_rel: string }[]} */
  const backup_refs = [];

  for (const relRaw of allowed_files) {
    const rel = String(relRaw != null ? relRaw : "").trim().replace(/\\/g, "/");
    if (!rel) continue;
    if (pathHasWildcard(rel)) continue;
    if (validatePathShape(rel)) continue;
    let absTarget;
    try {
      absTarget = resolveScopedFile(outputDirAbs, rel);
    } catch {
      continue;
    }
    if (!fs.existsSync(absTarget) || !fs.statSync(absTarget).isFile()) continue;

    const destAbs = path.join(backupAbsRoot, ...rel.split("/"));
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });
    try {
      fs.copyFileSync(absTarget, destAbs);
    } catch {
      continue;
    }
    tracked_files.push(rel);
    const backup_rel = `execution/${ROLLBACK_DIRNAME}/${BACKUPS_DIRNAME}/${sid}/${rel}`.replace(/\\/g, "/");
    backup_refs.push({ rel, backup_rel });
  }

  const now = iso();
  const snapDoc = {
    version: 1,
    subtask_id: sid,
    created_at: now,
    snapshot_state: "created",
    tracked_files,
    backup_refs,
    rollback_available: true,
  };
  fs.writeFileSync(snapPath, JSON.stringify(snapDoc, null, 2), "utf-8");

  const prevSnap = Number(rbDoc.snapshots_created) || 0;
  rbDoc.snapshots_created = prevSnap + 1;
  const ts = Array.isArray(rbDoc.tracked_subtasks)
    ? rbDoc.tracked_subtasks.map((x) => String(x))
    : [];
  if (!ts.includes(sid)) ts.push(sid);
  rbDoc.tracked_subtasks = ts;
  const tf = new Set(Array.isArray(rbDoc.tracked_files) ? rbDoc.tracked_files.map((x) => String(x).replace(/\\/g, "/")) : []);
  for (const t of tracked_files) tf.add(t);
  rbDoc.tracked_files = [...tf];
  writeRollbackState(execDir, rbDoc);

  mergeRollbackIntoSubtask(execDir, sid, {
    rollback_state: "rollback_available",
    snapshot_created_at: now,
  });

  events.push({
    type: "rollback_snapshot_created",
    recorded_at: now,
    payload: {
      subtask_id: sid,
      tracked_files_count: tracked_files.length,
      rollback_state: "rollback_available",
    },
  });

  return { skipped: false, tracked_files, backup_refs };
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   execDir: string,
 *   subtaskId: string,
 *   trigger: "execution_failed"|"patch_validation_failed"|"correction_failed_critical"|"manual_cli",
 *   modified_files: string[],
 *   allowed_files: string[],
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 * }} p
 * @returns {{ ok: boolean, restored: number, error?: string }}
 */
function tryAutoRollbackAfterFailure(p) {
  const { outputDirAbs, execDir, subtaskId, trigger, modified_files, allowed_files, events, iso } = p;
  const sid = String(subtaskId || "").trim();
  if (!/^\d{3}$/.test(sid)) return { ok: false, restored: 0, error: "INVALID_SUBTASK" };

  const allowedSet = new Set(allowed_files.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/")));
  const snapPath = snapshotFilePath(execDir, sid);
  const snap = snapPath && fs.existsSync(snapPath) ? readJsonObject(snapPath) : null;
  if (!snap || snap.rollback_available !== true) {
    events.push({
      type: "rollback_failed",
      recorded_at: iso(),
      payload: {
        subtask_id: sid,
        tracked_files_count: 0,
        rollback_state: "rollback_failed",
        reason: "NO_SNAPSHOT",
        trigger,
      },
    });
    mergeRollbackIntoSubtask(execDir, sid, {
      rollback_state: "rollback_failed",
      rollback_error: "NO_SNAPSHOT",
    });
    const rb = readJsonObject(rollbackStatePath(execDir));
    if (rb && typeof rb === "object" && !Array.isArray(rb)) {
      const d = /** @type {Record<string, unknown>} */ ({ ...rb });
      d.rollback_failures = (Number(d.rollback_failures) || 0) + 1;
      writeRollbackState(execDir, d);
    }
    return { ok: false, restored: 0, error: "NO_SNAPSHOT" };
  }

  mergeRollbackIntoSubtask(execDir, sid, { rollback_state: "rolling_back" });
  events.push({
    type: "rollback_started",
    recorded_at: iso(),
    payload: {
      subtask_id: sid,
      tracked_files_count: modified_files.length,
      rollback_state: "rolling_back",
      trigger,
    },
  });

  const modSet = new Set(
    (modified_files || []).map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/")).filter(Boolean),
  );
  /** @type {string[]} */
  const toRestore = [];
  if (modSet.size) {
    for (const m of modSet) {
      if (allowedSet.has(m)) toRestore.push(m);
    }
  } else {
    const tf = Array.isArray(snap.tracked_files) ? snap.tracked_files : [];
    for (const x of tf) {
      const r = String(x != null ? x : "").trim().replace(/\\/g, "/");
      if (r && allowedSet.has(r)) toRestore.push(r);
    }
  }

  const backupRefs = Array.isArray(snap.backup_refs) ? snap.backup_refs : [];
  const refByRel = new Map(
    backupRefs
      .filter((b) => b && typeof b === "object" && !Array.isArray(b))
      .map((b) => {
        const o = /** @type {Record<string, unknown>} */ (b);
        return [String(o.rel || "").replace(/\\/g, "/"), String(o.backup_rel || "").replace(/\\/g, "/")];
      }),
  );

  let restored = 0;
  /** @type {string[]} */
  const errs = [];

  const backupBase = backupDirForSubtask(execDir, sid);

  for (const rel of toRestore) {
    const errCode = assertRollbackPathSafe(rel, allowedSet);
    if (errCode) {
      errs.push(`${rel}:${errCode}`);
      continue;
    }
    if (!refByRel.has(rel)) {
      errs.push(`${rel}:NO_BACKUP_REF`);
      continue;
    }
    const src = backupBase ? path.join(backupBase, ...rel.split("/")) : "";
    if (!src || !fs.existsSync(src) || !fs.statSync(src).isFile()) {
      errs.push(`${rel}:BACKUP_MISSING`);
      continue;
    }

    let targetAbs;
    try {
      targetAbs = resolveScopedFile(outputDirAbs, rel);
    } catch (e) {
      errs.push(`${rel}:${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    try {
      fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
      fs.copyFileSync(src, targetAbs);
      const post = fs.readFileSync(targetAbs);
      if (!Buffer.isBuffer(post)) {
        errs.push(`${rel}:READBACK_INVALID`);
        continue;
      }
      restored += 1;
    } catch (e) {
      errs.push(`${rel}:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const now = iso();
  const rb = readJsonObject(rollbackStatePath(execDir));
  const rbDoc =
    rb && typeof rb === "object" && !Array.isArray(rb) ? /** @type {Record<string, unknown>} */ ({ ...rb }) : createInitialRollbackState();

  if (errs.length) {
    rbDoc.rollback_failures = (Number(rbDoc.rollback_failures) || 0) + 1;
    rbDoc.last_rollback_at = now;
    writeRollbackState(execDir, rbDoc);
    mergeRollbackIntoSubtask(execDir, sid, {
      rollback_state: "rollback_failed",
      rollback_error: errs.join("; "),
    });
    events.push({
      type: "rollback_failed",
      recorded_at: now,
      payload: {
        subtask_id: sid,
        tracked_files_count: toRestore.length,
        rollback_state: "rollback_failed",
        trigger,
        errors: errs,
      },
    });
    return { ok: false, restored, error: errs.join("; ") };
  }

  rbDoc.rollback_operations = (Number(rbDoc.rollback_operations) || 0) + 1;
  rbDoc.last_rollback_at = now;
  writeRollbackState(execDir, rbDoc);

  mergeRollbackIntoSubtask(execDir, sid, {
    rollback_state: "rollback_completed",
    rollback_completed_at: now,
    rollback_error: "",
  });

  events.push({
    type: "rollback_completed",
    recorded_at: now,
    payload: {
      subtask_id: sid,
      tracked_files_count: toRestore.length,
      rollback_state: "rollback_completed",
      trigger,
      restored_files_total: restored,
    },
  });

  return { ok: true, restored };
}

/**
 * @param {{ type: string, recorded_at?: string, payload?: Record<string, unknown> }[]} events
 */
function summarizeRollbackFromEvents(events) {
  let rollback_operations = 0;
  let rollback_failures = 0;
  let snapshots_created = 0;
  let restored_files_total = 0;
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const t = String(ev.type || "");
    if (t === "rollback_completed") {
      rollback_operations += 1;
      const pl = ev.payload && typeof ev.payload === "object" && !Array.isArray(ev.payload) ? ev.payload : null;
      if (pl && pl.restored_files_total != null) {
        restored_files_total += Number(pl.restored_files_total) || 0;
      }
    }
    if (t === "rollback_failed") rollback_failures += 1;
    if (t === "rollback_snapshot_created") snapshots_created += 1;
  }
  return { rollback_operations, rollback_failures, snapshots_created, restored_files_total };
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   loaded: { orderDoc: Record<string, unknown> },
 *   execDir: string,
 *   force: boolean,
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 * }} p
 * @returns {{ ok: boolean, error?: { code: string, message: string }, subtask_id?: string|null, restored_files_total?: number }}
 */
function runManualRollbackLastValidSnapshot(p) {
  const { outputDirAbs, loaded, execDir, force, events, iso } = p;
  const rows = orderedSubtaskRows(loaded.orderDoc);
  /** @type {string|null} */
  let picked = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const sid = rows[i].subtask_id;
    const sp = snapshotFilePath(execDir, sid);
    if (!sp || !fs.existsSync(sp)) continue;
    const snap = readJsonObject(sp);
    if (snap && snap.rollback_available === true && String(snap.snapshot_state || "") === "created") {
      picked = sid;
      break;
    }
  }
  if (!picked) {
    return { ok: false, error: { code: "ROLLBACK_NO_SNAPSHOT", message: "Nenhum snapshot válido encontrado." } };
  }

  const hfn = architectHandoffFilename(picked);
  const handoffPath = path.join(execDir, "handoffs", hfn || `${picked}-architect-handoff.json`);
  const ho = readJsonObject(handoffPath);
  const allowed = ho && Array.isArray(ho.allowed_files) ? ho.allowed_files.map((x) => String(x).trim().replace(/\\/g, "/")) : [];

  const resFn = `${picked}-execution-result.json`;
  const resPath = path.join(execDir, "results", resFn);
  const resDoc = readJsonObject(resPath);
  const modified = resDoc && Array.isArray(resDoc.modified_files) ? resDoc.modified_files.map((x) => String(x).trim().replace(/\\/g, "/")) : [];

  const evBefore = events.length;
  const r = tryAutoRollbackAfterFailure({
    outputDirAbs,
    execDir,
    subtaskId: picked,
    trigger: "manual_cli",
    modified_files: modified.length ? modified : [],
    allowed_files: allowed,
    events,
    iso,
  });
  const delta = events.slice(evBefore);
  persistDiagnosticsAppend(outputDirAbs, delta, iso);

  if (!r.ok && !force) {
    return {
      ok: false,
      error: { code: "ROLLBACK_APPLY_FAILED", message: r.error || "Rollback falhou." },
      subtask_id: picked,
      restored_files_total: r.restored,
    };
  }

  if (!r.ok && force) {
    mergeRollbackIntoSubtask(execDir, picked, {
      rollback_state: "rollback_failed",
      rollback_error: r.error || "unknown",
    });
  }

  return { ok: r.ok, subtask_id: picked, restored_files_total: r.restored };
}

/**
 * @param {string} outputDirAbs
 * @param {{ type: string, recorded_at: string, payload?: Record<string, unknown> }[]} newEvents
 * @param {() => string} iso
 */
function persistDiagnosticsAppend(outputDirAbs, newEvents, iso) {
  const diagPath = path.join(outputDirAbs, "execution", "execution-diagnostics.json");
  const doc = readJsonObject(diagPath);
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return;
  const d = /** @type {Record<string, unknown>} */ (doc);
  const ev = Array.isArray(d.events) ? /** @type {object[]} */ (d.events.slice()) : [];
  for (const e of newEvents) {
    ev.push(e);
  }
  d.events = ev;
  const sum =
    d.summary && typeof d.summary === "object" && !Array.isArray(d.summary)
      ? /** @type {Record<string, unknown>} */ ({ .../** @type {Record<string, unknown>} */ (d.summary) })
      : {};
  const rs = summarizeRollbackFromEvents(
    /** @type {{ type: string, recorded_at?: string, payload?: Record<string, unknown> }[]} */ (ev),
  );
  sum.rollback_operations = rs.rollback_operations;
  sum.rollback_failures = rs.rollback_failures;
  sum.snapshots_created = rs.snapshots_created;
  sum.restored_files_total = rs.restored_files_total;
  if (sum.rollback_enabled === undefined) {
    sum.rollback_enabled = true;
  }
  d.summary = sum;
  fs.writeFileSync(diagPath, JSON.stringify(d, null, 2), "utf-8");
}

/**
 * Migração MVP: garante artefactos 4.9 (rollback-state, campos session/diag, lifecycle phase)
 * quando um run já validado em 4.8 entra em skip sem reexecutar o pipeline.
 *
 * @param {string} outputDirAbs
 */
function ensureRollbackContractMvp(outputDirAbs) {
  const execDir = path.join(path.resolve(String(outputDirAbs || "")), "execution");
  if (!fs.existsSync(execDir)) return;
  initRollbackStateFile(execDir, false);
  const rb = readJsonObject(rollbackStatePath(execDir));
  const rbOps = rb && rb.rollback_operations != null ? Number(rb.rollback_operations) || 0 : 0;
  const rbFail = rb && rb.rollback_failures != null ? Number(rb.rollback_failures) || 0 : 0;
  const rbSnap = rb && rb.snapshots_created != null ? Number(rb.snapshots_created) || 0 : 0;

  const sessionPath = path.join(execDir, "execution-session.json");
  const sess = readJsonObject(sessionPath);
  if (sess && typeof sess === "object" && !Array.isArray(sess)) {
    const s = /** @type {Record<string, unknown>} */ (sess);
    s.phase = ROLLBACK_PHASE;
    if (typeof s.rollback_enabled !== "boolean") s.rollback_enabled = true;
    if (s.rollback_operations == null) s.rollback_operations = rbOps;
    if (s.rollback_failures == null) s.rollback_failures = rbFail;
    if (s.snapshots_created == null) s.snapshots_created = rbSnap;
    fs.writeFileSync(sessionPath, JSON.stringify(s, null, 2), "utf-8");
  }

  const diagPath = path.join(execDir, "execution-diagnostics.json");
  const d = readJsonObject(diagPath);
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const doc = /** @type {Record<string, unknown>} */ (d);
    const ev = Array.isArray(doc.events) ? /** @type {object[]} */ (doc.events) : [];
    const sm =
      doc.summary && typeof doc.summary === "object" && !Array.isArray(doc.summary)
        ? /** @type {Record<string, unknown>} */ ({ .../** @type {Record<string, unknown>} */ (doc.summary) })
        : {};
    const rbw = summarizeRollbackFromEvents(
      /** @type {{ type: string, recorded_at?: string, payload?: Record<string, unknown> }[]} */ (ev),
    );
    sm.rollback_enabled = true;
    sm.rollback_operations = rbOps || rbw.rollback_operations;
    sm.rollback_failures = rbFail || rbw.rollback_failures;
    sm.snapshots_created = rbSnap || rbw.snapshots_created;
    sm.restored_files_total = Number(rbw.restored_files_total) || 0;
    doc.summary = sm;
    fs.writeFileSync(diagPath, JSON.stringify(doc, null, 2), "utf-8");
  }

  const lfPath = path.join(execDir, LIFECYCLE_FILENAME);
  const lf = readJsonObject(lfPath);
  if (lf && typeof lf === "object" && !Array.isArray(lf) && String(lf.phase || "") !== ROLLBACK_PHASE && String(lf.phase || "") !== "4.10") {
    const l = /** @type {Record<string, unknown>} */ ({ ...lf });
    l.phase = ROLLBACK_PHASE;
    fs.writeFileSync(lfPath, JSON.stringify(l, null, 2), "utf-8");
  }
}

module.exports = {
  ROLLBACK_PHASE,
  ROLLBACK_DIRNAME,
  ROLLBACK_STATE_FILENAME,
  ROLLBACK_STATE_VALUES,
  rollbackRoot,
  rollbackStatePath,
  snapshotFilePath,
  backupDirForSubtask,
  createInitialRollbackState,
  initRollbackStateFile,
  createPreExecutionSnapshot,
  tryAutoRollbackAfterFailure,
  summarizeRollbackFromEvents,
  persistDiagnosticsAppend,
  runManualRollbackLastValidSnapshot,
  assertRollbackPathSafe,
  ensureRollbackContractMvp,
};
