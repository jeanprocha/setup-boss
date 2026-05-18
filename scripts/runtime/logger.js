"use strict";

/**
 * Log human-readable append-only para desenvolvimento local (tipo laravel.log).
 * Caminho: <repo-root>/logs/runtime.log (+ errors duplicados em runtime-error.log).
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const LOG_DIR = path.join(REPO_ROOT, "logs");
const LOG_MAIN = path.join(LOG_DIR, "runtime.log");
const LOG_ERR = path.join(LOG_DIR, "runtime-error.log");

/** Eventos demasiado ruidosos para o log por defeito */
const EMIT_NOISE_TYPES = new Set([
  "scheduler_tick",
  "worker_busy",
  "worker_idle",
]);

let dirEnsured = false;

function ensureLogsDir() {
  if (dirEnsured) return;
  fs.mkdirSync(LOG_DIR, { recursive: true });
  dirEnsured = true;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatTs(d = new Date()) {
  const yyyy = d.getFullYear();
  const MM = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const HH = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}.${ms}`;
}

function stringifyVal(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.replace(/\r?\n/g, "\\n");
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch (_) {
    return String(v);
  }
}

/**
 * Achata um nível de objetos aninhados para key.subkey=value (simples).
 * @param {string} prefix
 * @param {Record<string, unknown>} obj
 * @param {Record<string, unknown>} out
 */
function flatten(prefix, obj, out) {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return;
  for (const [k, val] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (
      val != null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      !(val instanceof Date)
    ) {
      flatten(key, /** @type {Record<string, unknown>} */ (val), out);
    } else {
      out[key] = val;
    }
  }
}

/**
 * @param {"DEBUG"|"INFO"|"WARN"|"ERROR"} level
 * @param {string} event
 * @param {Record<string, unknown>|undefined} data
 * @param {Error|unknown} [err]
 */
function formatRecord(level, event, data, err) {
  const lines = [];
  lines.push(`[${formatTs()}] ${level} ${event}`);
  const merged = {};
  if (data && typeof data === "object") {
    flatten("", /** @type {Record<string, unknown>} */ (data), merged);
  }
  const keys = Object.keys(merged).sort();
  for (const k of keys) {
    const s = stringifyVal(merged[k]);
    if (s === "") lines.push(`${k}=`);
    else if (s.length > 4000) lines.push(`${k}=${s.slice(0, 3997)}…`);
    else lines.push(`${k}=${s}`);
  }
  if (err != null && err !== undefined) {
    const e = err instanceof Error ? err : new Error(String(err));
    lines.push(`error=${stringifyVal(e.message)}`);
    if (e.stack) {
      for (const ln of String(e.stack).split(/\r?\n/)) {
        lines.push(`  ${ln}`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

function appendMain(raw) {
  try {
    ensureLogsDir();
    fs.appendFileSync(LOG_MAIN, raw, { encoding: "utf8" });
  } catch (e) {
    try {
      console.error("[runtime-logger] falha ao escrever logs/runtime.log:", e && e.message);
    } catch (_) {
      /* */
    }
  }
}

function appendErrorDup(raw) {
  appendMain(raw);
  try {
    ensureLogsDir();
    fs.appendFileSync(LOG_ERR, raw, { encoding: "utf8" });
  } catch (_) {
    /* */
  }
}

/**
 * @param {string} event
 * @param {Record<string, unknown>=} data
 */
function info(event, data) {
  appendMain(formatRecord("INFO", event, data));
}

/**
 * @param {string} event
 * @param {Record<string, unknown>=} data
 */
function warn(event, data) {
  appendMain(formatRecord("WARN", event, data));
}

/**
 * @param {string} event
 * @param {Record<string, unknown>=} data
 */
function debug(event, data) {
  if (process.env.SETUP_BOSS_RUNTIME_DEBUG_LOG !== "1") return;
  appendMain(formatRecord("DEBUG", event, data));
}

/**
 * @param {string} event
 * @param {Error|unknown} err
 * @param {Record<string, unknown>=} data
 */
function error(event, err, data) {
  appendErrorDup(formatRecord("ERROR", event, data, err));
}

/**
 * Eco legível dos eventos já persistidos em events.jsonl (não substitui JSONL).
 * @param {import("../daemon/lib/runtime-events").RuntimeEventRow} evt
 */
function logEmit(evt) {
  const type = String(evt?.type || "");
  if (!type || EMIT_NOISE_TYPES.has(type)) return;

  /** @type {Record<string, unknown>} */
  const data = {
    eventId: evt.id,
    jobId: evt.jobId,
    runId: evt.runId,
    projectId: evt.projectId,
    projectRoot: evt.projectRoot,
  };
  if (evt.data && typeof evt.data === "object") {
    Object.assign(data, evt.data);
  }

  const tl = type.toLowerCase();
  let level = "INFO";
  if (
    tl.includes("_failed") ||
    tl.includes("_error") ||
    tl.includes("crashed") ||
    tl.includes("phase_failed")
  ) {
    level = "ERROR";
  } else if (
    tl.includes("stuck") ||
    tl.includes("retry_rejected") ||
    tl.includes("cancel_requested") ||
    tl.includes("cancelled")
  ) {
    level = "WARN";
  }

  if (type === "clarification_initialized") {
    if (data.questionsCount === 0) {
      level = "WARN";
      if (data.message == null) {
        data.message = "Clarification initialized without generated questions";
      }
    } else {
      level = "INFO";
    }
  }

  const eventName = `runtime.emit.${type}`;
  const raw = formatRecord(level, eventName, data);
  if (level === "ERROR") appendErrorDup(raw);
  else appendMain(raw);
}

module.exports = {
  info,
  warn,
  error,
  debug,
  logEmit,
  LOG_MAIN,
  LOG_ERR,
  LOG_DIR,
  REPO_ROOT,
};
