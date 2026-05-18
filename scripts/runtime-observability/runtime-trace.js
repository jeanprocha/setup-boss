"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");

const { getDaemonDirs } = require("../daemon/lib/daemon-paths");

/** @typedef {Record<string, unknown>} TraceMetadata */

const traceAls = new AsyncLocalStorage();

/**
 * @returns {string}
 */
function resolveDataDirAbs() {
  const { setupBossDir } = getDaemonDirs();
  return path.resolve(setupBossDir);
}

/**
 * @returns {string}
 */
function fallbackTraceFileAbs() {
  return path.join(resolveDataDirAbs(), "traces", "runtime-trace.jsonl");
}

/**
 * @param {string} outputDirAbs
 * @returns {string}
 */
function runTraceFileAbs(outputDirAbs) {
  return path.join(path.resolve(outputDirAbs), "runtime-trace.jsonl");
}

/**
 * @param {string} absPath
 * @param {string} line
 */
function appendLineSafe(absPath, line) {
  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.appendFileSync(absPath, `${line}\n`, "utf8");
  } catch (e) {
    const msg = e && /** @type {{ message?: string }} */ (e).message ? String(e.message) : String(e);
    console.warn(`[runtime-trace] append failed (${absPath}): ${msg}`);
  }
}

/**
 * @returns {Record<string, unknown>|undefined}
 */
function getTraceContext() {
  return traceAls.getStore();
}

/**
 * @param {Record<string, unknown>} patch
 */
function mergeTraceContext(patch) {
  const s = traceAls.getStore();
  if (!s || !patch || typeof patch !== "object") return;
  Object.assign(s, patch);
}

/**
 * @param {unknown} err
 * @returns {{ code?: string, message: string, name?: string } | null}
 */
function safeSerializeError(err) {
  if (err == null) return null;
  if (typeof err === "string") return { message: err };
  if (typeof err !== "object") return { message: String(err) };
  const o = /** @type {{ code?: unknown, message?: unknown, name?: unknown }} */ (err);
  const msg =
    o.message != null
      ? String(o.message)
      : (() => {
          try {
            return JSON.stringify(err);
          } catch {
            return String(err);
          }
        })();
  return {
    code: o.code != null ? String(o.code) : undefined,
    message: msg,
    name: o.name != null ? String(o.name) : undefined,
  };
}

/**
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} patch
 * @returns {Record<string, unknown>}
 */
function createTraceEntry(base, patch) {
  return { ...base, ...patch };
}

/**
 * @param {Record<string, unknown>} partial
 * @returns {Record<string, unknown>}
 */
function normalizeTraceEntry(partial) {
  const ctx = /** @type {Record<string, unknown>} */ (traceAls.getStore() || {});
  const dataDir = resolveDataDirAbs();
  const outDirRaw =
    partial.outputDir != null
      ? partial.outputDir
      : ctx.outputDir != null
        ? ctx.outputDir
        : null;
  const outputDir =
    outDirRaw != null && String(outDirRaw).trim()
      ? path.resolve(String(outDirRaw).trim())
      : null;

  /** @type {Record<string, unknown>} */
  const entry = {
    timestamp: new Date().toISOString(),
    level: partial.level != null ? String(partial.level) : "info",
    component:
      partial.component != null ? String(partial.component) : "setup-boss",
    event: partial.event != null ? String(partial.event) : "unknown",
    requestId:
      partial.requestId != null
        ? String(partial.requestId)
        : ctx.requestId != null
          ? String(ctx.requestId)
          : null,
    projectId:
      partial.projectId != null
        ? String(partial.projectId)
        : ctx.projectId != null
          ? String(ctx.projectId)
          : null,
    jobId:
      partial.jobId != null
        ? String(partial.jobId)
        : ctx.jobId != null
          ? String(ctx.jobId)
          : null,
    runId:
      partial.runId != null
        ? String(partial.runId)
        : ctx.runId != null
          ? String(ctx.runId)
          : null,
    phase: partial.phase != null ? String(partial.phase) : null,
    step: partial.step != null ? String(partial.step) : null,
    message: partial.message != null ? String(partial.message) : "",
    dataDir,
    projectRoot:
      partial.projectRoot != null
        ? String(partial.projectRoot)
        : ctx.projectRoot != null
          ? String(ctx.projectRoot)
          : null,
    outputDir,
    artifactPath:
      partial.artifactPath != null ? String(partial.artifactPath) : null,
    durationMs:
      typeof partial.durationMs === "number" && Number.isFinite(partial.durationMs)
        ? partial.durationMs
        : null,
    source: partial.source != null ? String(partial.source) : "daemon",
    derivedFrom:
      partial.derivedFrom != null ? String(partial.derivedFrom) : "unknown",
    metadata:
      partial.metadata != null && typeof partial.metadata === "object" && !Array.isArray(partial.metadata)
        ? /** @type {TraceMetadata} */ (partial.metadata)
        : {},
    error:
      partial.error !== undefined
        ? partial.error === null
          ? null
          : typeof partial.error === "object"
            ? partial.error
            : { message: String(partial.error) }
        : null,
  };

  return entry;
}

/**
 * Append JSONL trace line (fallback file sempre; ficheiro da run quando outputDir conhecido).
 * @param {Record<string, unknown>} partial
 */
function appendRuntimeTrace(partial) {
  const entry = normalizeTraceEntry(partial);
  const line = JSON.stringify(entry);
  appendLineSafe(fallbackTraceFileAbs(), line);
  if (entry.outputDir && fs.existsSync(String(entry.outputDir))) {
    appendLineSafe(runTraceFileAbs(String(entry.outputDir)), line);
  }
}

/**
 * @param {string} outputDirAbs
 * @param {Record<string, unknown>} partial
 */
function appendRunTrace(outputDirAbs, partial) {
  mergeTraceContext({ outputDir: path.resolve(outputDirAbs) });
  appendRuntimeTrace({ ...partial, outputDir: path.resolve(outputDirAbs) });
}

/**
 * Executa fn dentro de um contexto de trace (propaga por async/await).
 * @template T
 * @param {Record<string, unknown>} initial
 * @param {() => Promise<T>|T} fn
 * @returns {Promise<T>}
 */
async function runWithTraceContext(initial, fn) {
  const store = { ...initial };
  return traceAls.run(store, async () => fn());
}

/**
 * Regista emissão de evento runtime/SSE (payload não incluído na íntegra).
 * @param {{
 *   type: string,
 *   jobId?: string|null,
 *   runId?: string|null,
 *   projectId?: string|null,
 *   data?: Record<string, unknown>|null,
 * }} payload
 */
function tryAppendSseTrace(payload) {
  try {
    const data =
      payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? payload.data
        : {};
    const payloadKeys = Object.keys(data).slice(0, 40);
    appendRuntimeTrace({
      component: "runtime_events",
      event: "sse_event_emitted",
      phase: "events",
      step: "emit",
      message: `runtime event ${String(payload.type || "")}`,
      source: "sse",
      derivedFrom: "unknown",
      metadata: {
        eventName: String(payload.type || ""),
        payloadKeys,
        payloadSummary:
          payloadKeys.length > 0 ? `${payloadKeys.slice(0, 8).join(",")}${payloadKeys.length > 8 ? "…" : ""}` : "",
      },
      jobId: payload.jobId != null ? String(payload.jobId) : null,
      runId: payload.runId != null ? String(payload.runId) : null,
      projectId: payload.projectId != null ? String(payload.projectId) : null,
    });
  } catch (e) {
    console.warn("[runtime-trace] tryAppendSseTrace:", e && e.message ? e.message : e);
  }
}

/**
 * @returns {string}
 */
function generateRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req_${crypto.randomBytes(12).toString("hex")}`;
}

module.exports = {
  appendRuntimeTrace,
  appendRunTrace,
  createTraceEntry,
  safeSerializeError,
  mergeTraceContext,
  getTraceContext,
  runWithTraceContext,
  tryAppendSseTrace,
  generateRequestId,
  fallbackTraceFileAbs,
  runTraceFileAbs,
  resolveDataDirAbs,
};
