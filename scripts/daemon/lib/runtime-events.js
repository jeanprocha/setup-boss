"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDaemonDirs } = require("./daemon-paths");

const MAX_EVENTS_FILE_BYTES = Number(
  process.env.SETUP_BOSS_EVENTS_MAX_BYTES || 1048576,
);

const EVENTS_TRIM_KEEP_LINES = Number(
  process.env.SETUP_BOSS_EVENTS_TRIM_LINES || 4000,
);

/** Eventos públicos da Fase 3.4 (snake_case). */
const KNOWN_RUNTIME_EVENT_TYPES = new Set([
  "job_enqueued",
  "job_started",
  "job_completed",
  "job_failed",
  "job_cancel_requested",
  "job_cancelled",
  "job_retry_requested",
  "job_requeued",
  "job_retry_rejected",
  "job_stuck_detected",
  "worker_stuck_detected",
  "daemon_recovery_started",
  "daemon_recovery_completed",
  "daemon_recovered_job",
  "daemon_recovered_lock",
  "maintenance_queue_pruned",
  "maintenance_events_pruned",
  "runtime_started",
  "runtime_finished",
  "phase_started",
  "phase_completed",
  "phase_failed",
  "worker_busy",
  "worker_idle",
  "job_scheduled",
  "job_available",
  "job_delayed",
  "retry_scheduled",
  "retry_available",
  "recurring_job_created",
  "recurring_job_scheduled",
  "recurring_job_skipped",
  "scheduler_tick",
  "scheduler_recovered",
  "delayed_job_recovered",
  "worker_started",
  "worker_stopping",
  "worker_stopped",
  "worker_crashed",
  "job_skipped_project_busy",
  "job_claimed",
]);

/** @type {Set<(e: RuntimeEventRow) => void>} */
let listeners = new Set();

/**
 * @typedef {{
 *   id: string,
 *   jobId: string|null,
 *   runId: string|null,
 *   type: string,
 *   timestamp: string,
 *   projectId?: string|null,
 *   projectRoot?: string|null,
 *   data: Record<string, unknown>,
 * }} RuntimeEventRow
 */

function eventsJsonlPath() {
  const { daemonDir } = getDaemonDirs();
  return path.join(daemonDir, "events.jsonl");
}

function ensureDaemonDir() {
  const { daemonDir } = getDaemonDirs();
  fs.mkdirSync(daemonDir, { recursive: true });
}

function makeEventId() {
  return `evt_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`;
}

/**
 * @param {(e: RuntimeEventRow) => void} fn
 * @returns {() => void} unsubscribe
 */
function subscribeRuntimeEventListener(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => {
    try {
      listeners.delete(fn);
    } catch (_) {
      /* */
    }
  };
}

/** @returns {RuntimeEventRow[]} */
function parseJsonl(raw) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const out = [];
  for (const line of lines) {
    try {
      /** @type {RuntimeEventRow} */
      const o = JSON.parse(line);
      if (o && typeof o === "object" && typeof o.type === "string" && typeof o.id === "string") {
        if (!("data" in o) || o.data == null || typeof o.data !== "object")
          o.data = {};
        out.push(o);
      }
    } catch (_) {
      /* tolerante — linhas corrompidas ignoradas */
    }
  }

  return out;
}

/** Lê até maxBytes do fim do ficheiro (UTF-8 aprox.). */
function readFileTail(absPath, maxBytes) {
  try {
    if (!fs.existsSync(absPath)) return "";
    const st = fs.statSync(absPath);

    const want = Math.min(maxBytes, st.size);

    const fd = fs.openSync(absPath, "r");


    try {
      const buf = Buffer.allocUnsafe(want);
      fs.readSync(fd, buf, 0, want, st.size - want);
      return buf.toString("utf8");
    } finally {

      fs.closeSync(fd);


    }



  } catch (_) {
    return "";
  }

}

/** Última fase estável vista em `phase_started` para este job (tail do store). */


function deriveCurrentPhaseForJobFromStore(jobId) {

  const jid = jobId != null ? String(jobId) : "";

  if (!jid) return null;



  const p = eventsJsonlPath();


  const tail = readFileTail(p, Math.min(786432, MAX_EVENTS_FILE_BYTES));

  const evs = parseJsonl(tail);


  /** @type {string|null} */

  let last = null;


  for (const e of evs) {

    if (String(e.jobId || "") !== jid) continue;



    if (e.type === "phase_started") {

      const ph =



        e.data &&



        typeof (/** @type {any} */ (e.data).phase) === "string"


          ? String((/** @type {any} */ (e.data)).phase).trim()


          : "";



      if (ph) last = ph;

    }



  }



  return last;

}

/** Último timestamp ISO de um evento de pipeline/runtime para este job (tail). */

function deriveLastPipelineEventAtForJobFromStore(jobId) {



  const jid = jobId != null ? String(jobId) : "";



  if (!jid) return null;



  const p = eventsJsonlPath();


  const tail = readFileTail(p, Math.min(786432, MAX_EVENTS_FILE_BYTES));


  const evs = parseJsonl(tail);


  /** @type {string|null} */

  let lastTs = null;


  const types =


    new Set([


      "phase_started",


      "phase_completed",


      "phase_failed",


      "runtime_started",


      "runtime_finished",


    ]);

  for (const e of evs) {


    if (String(e.jobId || "") !== jid) continue;



    if (!types.has(e.type)) continue;



    if (typeof e.timestamp === "string" && e.timestamp) lastTs = e.timestamp;



  }



  return lastTs;

}



function maybeRotateEventsFile(absPath) {



  try {



    if (!fs.existsSync(absPath)) return;


    const st = fs.statSync(absPath);


    if (st.size <= MAX_EVENTS_FILE_BYTES) return;



    const raw = fs.readFileSync(absPath, "utf8");


    const lines = raw.split(/\r?\n/).filter((l) => l.trim());


    const keep = Math.max(500, EVENTS_TRIM_KEEP_LINES);


    const tail = lines.slice(-keep);


    const tmp = `${absPath}.${process.pid}.${Date.now()}.trim.tmp`;


    fs.writeFileSync(tmp, tail.join("\n") + (tail.length ? "\n" : ""), "utf8");


    fs.renameSync(tmp, absPath);

  } catch (_) {

    /* rotação best-effort */

  }



}

/**
 * Manutenção explícita do events.jsonl (por tamanho ou forcado).
 * @param {{ maxBytes?: number, keepLines?: number, force?: boolean }} opts
 * @returns {{ trimmed: boolean, beforeBytes?: number, afterBytes?: number, linesKept?: number }}
 */

function pruneRuntimeEventsFile(opts = {}) {


  const abs = eventsJsonlPath();


  ensureDaemonDir();


  const maxBytes =


    typeof opts.maxBytes === "number" && Number.isFinite(opts.maxBytes) && opts.maxBytes > 0


      ? opts.maxBytes


      : MAX_EVENTS_FILE_BYTES;


  const keepLines =


    typeof opts.keepLines === "number" && Number.isFinite(opts.keepLines) && opts.keepLines > 0


      ? Math.floor(opts.keepLines)


      : Math.max(500, EVENTS_TRIM_KEEP_LINES);


  try {


    if (!fs.existsSync(abs)) return { trimmed: false, empty: true };


    const st = fs.statSync(abs);


    const beforeBytes = st.size;


    const force = opts.force === true;


    if (!force && beforeBytes <= maxBytes) return { trimmed: false, beforeBytes };


    const raw = fs.readFileSync(abs, "utf8");


    const lines = raw.split(/\r?\n/).filter((l) => l.trim());


    const tail = lines.slice(-keepLines);


    const tmp = `${abs}.${process.pid}.${Date.now()}.prune.tmp`;


    fs.writeFileSync(tmp, tail.join("\n") + (tail.length ? "\n" : ""), "utf8");


    fs.renameSync(tmp, abs);


    const after = fs.statSync(abs);


    return {


      trimmed: true,


      beforeBytes,


      afterBytes: after.size,


      linesKept: tail.length,


    };


  } catch (_) {


    return { trimmed: false, error: "prune_failed" };


  }


}

/** Valida leitura do ficheiro de eventos (sem mudanças). */


function validateRuntimeEventsReadable() {


  const abs = eventsJsonlPath();


  try {


    if (!fs.existsSync(abs)) return { ok: true, empty: true };


    fs.accessSync(abs, fs.constants.R_OK);


    const st = fs.statSync(abs);


    const fd = fs.openSync(abs, "r");


    try {


      const sample = Buffer.alloc(Math.min(4096, st.size));


      fs.readSync(fd, sample, 0, sample.length, 0);


    } finally {


      fs.closeSync(fd);


    }


    return { ok: true, bytes: st.size };


  } catch (e) {


    return { ok: false, error: String((e && e.message) || e) };


  }


}





/**
 * @param {{
 *   type: string,
 *   jobId?: string|null,
 *   runId?: string|null,
 *   projectId?: string|null,
 *   projectRoot?: string|null,
 *   data?: Record<string, unknown>,
 * }} payload
 * @returns {RuntimeEventRow|null}
 */





function emitRuntimeEvent(payload) {



  const type = String(payload?.type || "");



  if (!type) return null;



  ensureDaemonDir();



  const abs = eventsJsonlPath();



  const id = makeEventId();



  let jobId =



    payload.jobId != undefined && payload.jobId != null



      ? String(payload.jobId)


      : process.env.SETUP_BOSS_DAEMON_JOB_ID



        ? String(process.env.SETUP_BOSS_DAEMON_JOB_ID)


        : null;



  if (jobId === "") jobId = null;



  let projectId =
    payload.projectId != undefined && payload.projectId != null && String(payload.projectId).trim()
      ? String(payload.projectId).trim()
      : null;

  let projectRoot =
    payload.projectRoot != undefined &&
    payload.projectRoot != null &&
    String(payload.projectRoot).trim()
      ? String(payload.projectRoot).trim()
      : null;

  if ((!projectId || !projectRoot) && jobId) {
    try {
      const { loadQueueUnsafe } = require("./queue-store");
      const q = loadQueueUnsafe();
      const row = q.jobs.find((x) => x && String(x.id) === String(jobId));
      if (row) {
        if (!projectId && row.projectId) projectId = String(row.projectId).trim();
        if (!projectRoot && row.projectRoot) projectRoot = String(row.projectRoot).trim();
      }
    } catch (_) {
      /* */
    }
  }

  const baseData =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? /** @type {Record<string, unknown>} */ ({ ...payload.data })
      : {};
  if (projectId && baseData.projectId == null) baseData.projectId = projectId;
  if (projectRoot && baseData.projectRoot == null) baseData.projectRoot = projectRoot;

  const evt = {


    id,


    jobId,



    runId:



      payload.runId !== undefined && payload.runId != null



        ? String(payload.runId)


        : null,



    type,

    projectId,

    projectRoot,

    timestamp: new Date().toISOString(),


    data: baseData,



  };



  const line = `${JSON.stringify(evt)}\n`;



  try {


    fs.appendFileSync(abs, line, { encoding: "utf8" });

  } catch (_) {


    return null;

  }



  maybeRotateEventsFile(abs);



  for (const fn of listeners) {


    try {


      fn(evt);

    } catch (_) {

      /* não quebrar o daemon */

    }

  }



  return evt;

}



/**
 * Lista eventos (ordem cronológica no ficheiro).
 * @param {{ jobId?: string|null, projectId?: string|null, limit?: number, after?: string|null }} q
 */


function readRuntimeEventsFiltered(q = {}) {


  const abs = eventsJsonlPath();


  let raw = "";



  try {


    raw = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";

  } catch (_) {


    raw = "";

  }



  /** @type {RuntimeEventRow[]} */



  const all = parseJsonl(raw);


  const jobId =


    q.jobId != null && String(q.jobId).trim() ? String(q.jobId).trim() : null;

  const projectIdFilter =
    q.projectId != null && String(q.projectId).trim() ? String(q.projectId).trim() : null;



  const after =
    q.after != null && String(q.after).trim() ? String(q.after).trim() : null;



  let started = after == null;


  /** @type {RuntimeEventRow[]} */



  const matched = [];

  for (const e of all) {


    if (!started) {


      if (e.id === after) {


        started = true;

      }



      continue;

    }



    if (jobId && String(e.jobId || "") !== jobId) continue;

    if (projectIdFilter) {
      const top =
        e &&
        /** @type {any} */ (e).projectId != null &&
        String(/** @type {any} */ (e).projectId).trim()
          ? String(/** @type {any} */ (e).projectId).trim()
          : null;

      const inData =
        e.data &&
        typeof e.data === "object" &&
        /** @type {any} */ (e.data).projectId != null &&
        String(/** @type {any} */ (e.data).projectId).trim()
          ? String(/** @type {any} */ (e.data).projectId).trim()
          : null;

      const cand = top || inData;

      if (cand !== projectIdFilter) continue;
    }

    matched.push(e);

  }



  let limit =


    typeof q.limit === "number" && Number.isFinite(q.limit)



      ? Math.floor(q.limit)



      : 200;



  if (limit < 1) limit = 1;



  if (limit > 500) limit = 500;



  return matched.slice(-limit);

}



module.exports = {




  KNOWN_RUNTIME_EVENT_TYPES,





  emitRuntimeEvent,





  readRuntimeEventsFiltered,





  subscribeRuntimeEventListener,





  eventsJsonlPath,





  deriveCurrentPhaseForJobFromStore,





  deriveLastPipelineEventAtForJobFromStore,

  pruneRuntimeEventsFile,

  validateRuntimeEventsReadable,

  _test: {




    parseJsonl,





    makeEventId,




  },



};

