"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveOutputDir } = require("../../../core/run-resolver");
const { loadQueueUnsafe, jobIsRetryable } = require("./queue-store");

const LOG_MAIN = path.join(__dirname, "..", "..", "..", "logs", "runtime.log");
const TAIL_BYTES = Math.min(
  Number(process.env.SETUP_BOSS_RUNTIME_LOG_TAIL_BYTES || 393216),
  2 * 1024 * 1024,
);
const MAX_ENTRIES = Math.min(
  Number(process.env.SETUP_BOSS_RUNTIME_LOG_TAIL_MAX || 120),
  300,
);
const MAX_DETAIL_CHARS = Math.min(
  Number(process.env.SETUP_BOSS_RUNTIME_LOG_DETAIL_MAX || 12000),
  64_000,
);

/** Eventos globais do daemon — não pertencem à observabilidade de uma run. */
const GLOBAL_DAEMON_LOG_EVENTS = new Set([
  "runtime.projects.pipeline",
  "runtime.projects.list",
]);

/**
 * @param {string} runKey
 * @returns {string|null}
 */
function assertSafeRunKeySegment(runKey) {
  const s = String(runKey || "").trim();
  if (!s || s.length > 280) return null;
  if (s.includes("..") || /[\\/]/.test(s)) return null;
  return s;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} block
 * @param {string|null} repoRoot
 */
function sanitizeLogBlock(block, repoRoot) {
  let t = String(block || "");
  if (repoRoot && typeof repoRoot === "string" && repoRoot.length > 1) {
    const roots = new Set([repoRoot, repoRoot.replace(/\\/g, "/")]);
    for (const r of roots) {
      if (!r || r.length < 2) continue;
      const re = new RegExp(escapeRegExp(r), "gi");
      t = t.replace(re, "[repo]");
    }
  }
  t = t.replace(/\bBearer\s+[A-Za-z0-9._-]+\b/gi, "Bearer [redacted]");
  t = t.replace(/\bgh[pousr]_[A-Za-z0-9]+\b/gi, "[token]");
  t = t.replace(/\bxox[baprs]-[A-Za-z0-9-]+\b/gi, "[token]");
  return t;
}

/**
 * @param {string} absPath
 * @param {number} maxBytes
 */
function readFileTailUtf8(absPath, maxBytes) {
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

/**
 * @param {string} block
 * @param {string} runKey
 * @param {string|null} jobIdHint
 */
function logBlockMatchesRun(block, runKey, jobIdHint) {
  const keys = [runKey, jobIdHint].filter(Boolean);
  for (const k of keys) {
    const esc = escapeRegExp(k);
    const re = new RegExp(`(?:^|\\n)(?:runId|jobId)=${esc}(?:\\n|$)`);
    if (re.test(block)) return true;
  }
  return false;
}

const HEADER_RE =
  /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\]\s+(DEBUG|INFO|WARN|ERROR)\s+(\S+)/;

/**
 * @param {string} eventName
 * @returns {boolean}
 */
function isGlobalDaemonLogEvent(eventName) {
  return GLOBAL_DAEMON_LOG_EVENTS.has(String(eventName || "").trim());
}

/**
 * @param {string|null} detail
 * @returns {{ detail: string|null, detailTruncated: boolean, detailBytes: number }}
 */
function capDaemonLogDetail(detail) {
  if (detail == null || detail === "") {
    return { detail: null, detailTruncated: false, detailBytes: 0 };
  }
  const raw = String(detail);
  const detailBytes = Buffer.byteLength(raw, "utf8");
  if (raw.length <= MAX_DETAIL_CHARS) {
    return { detail: raw, detailTruncated: false, detailBytes };
  }
  const clipped = raw.slice(0, MAX_DETAIL_CHARS);
  return {
    detail: `${clipped}\n… [detail truncated: ${detailBytes} bytes total, cap ${MAX_DETAIL_CHARS} chars]`,
    detailTruncated: true,
    detailBytes,
  };
}

/**
 * @param {string} rawTail
 * @param {string} runKey
 * @param {string|null} jobIdHint
 * @param {string|null} repoRoot
 */
function parseDaemonLogTail(rawTail, runKey, jobIdHint, repoRoot) {
  const parts = String(rawTail || "")
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);

  /** @type {{ id: string, tsIso: string|null, level: string, category: string, message: string, detail: string|null }[]} */
  const out = [];
  for (const block of parts) {
    if (!logBlockMatchesRun(block, runKey, jobIdHint)) continue;
    const clean = sanitizeLogBlock(block, repoRoot);
    const lines = clean.split(/\r?\n/).filter(Boolean);
    const head = lines[0] ?? "";
    const m = head.match(HEADER_RE);
    const tsRaw = m ? m[1] : null;
    const level = m ? m[2] : "INFO";
    const eventName = m ? m[3] : "daemon";
    if (isGlobalDaemonLogEvent(eventName)) continue;
    let tsIso = null;
    if (tsRaw) {
      const isoTry = tsRaw.replace(" ", "T");
      const d = Date.parse(`${isoTry}Z`);
      tsIso = Number.isFinite(d) ? new Date(d).toISOString() : null;
    }
    const detailLines = m ? lines.slice(1) : lines;
    const detailRaw = detailLines.length ? detailLines.join("\n") : null;
    const capped = capDaemonLogDetail(detailRaw);
    out.push({
      id: `dlog_${crypto.createHash("sha256").update(clean).digest("hex").slice(0, 16)}`,
      tsIso,
      level,
      category: "daemon",
      message: m ? `${eventName}` : head.slice(0, 400),
      detail: capped.detail,
      detailTruncated: capped.detailTruncated,
      detailBytes: capped.detailBytes,
    });
    if (out.length >= MAX_ENTRIES) break;
  }
  return out.slice(-MAX_ENTRIES);
}

/**
 * @param {string} repoRoot
 * @param {string} runKeyRaw
 */
function buildRunObservabilityBundle(repoRoot, runKeyRaw) {
  const runKey = assertSafeRunKeySegment(runKeyRaw);
  if (!runKey) {
    return {
      ok: false,
      code: "invalid_run_key",
      message: "Identificador de corrida inválido.",
    };
  }

  let outputDirBasename = null;
  try {
    const abs = path.resolve(resolveOutputDir(runKey, { warnLegacy: false }));
    outputDirBasename = path.basename(abs);
  } catch (_) {
    outputDirBasename = null;
  }

  let queueJob = null;
  try {
    const q = loadQueueUnsafe();
    const row = (q.jobs || []).find(
      (j) =>
        j &&
        (String(j.id) === runKey ||
          (j.runId != null && String(j.runId) === runKey)),
    );
    if (row) {
      const pid =
        row.projectId != null && String(row.projectId).trim()
          ? String(row.projectId).trim()
          : null;
      queueJob = {
        id: String(row.id),
        status: String(row.status || ""),
        runId: row.runId != null ? String(row.runId) : null,
        projectId: pid,
        createdAt: row.createdAt != null ? String(row.createdAt) : null,
        startedAt: row.startedAt != null ? String(row.startedAt) : null,
        finishedAt: row.finishedAt != null ? String(row.finishedAt) : null,
        retryable: jobIsRetryable(row),
        attempts:
          row.attempts != null && Number.isFinite(Number(row.attempts))
            ? Math.floor(Number(row.attempts))
            : null,
        errorMessage:
          row.error &&
          typeof row.error === "object" &&
          row.error.message != null
            ? String(row.error.message).slice(0, 480)
            : null,
      };
    }
  } catch (_) {
    queueJob = null;
  }

  const jobIdHint = queueJob ? queueJob.id : null;
  const absLog = path.isAbsolute(LOG_MAIN) ? LOG_MAIN : path.join(repoRoot, "logs", "runtime.log");
  const tail = readFileTailUtf8(absLog, TAIL_BYTES);
  const daemonLogEntries = parseDaemonLogTail(tail, runKey, jobIdHint, repoRoot);

  return {
    ok: true,
    data: {
      runKey,
      outputDirBasename,
      queueJob,
      daemonLogEntries,
    },
  };
}

module.exports = {
  assertSafeRunKeySegment,
  buildRunObservabilityBundle,
  _test: {
    sanitizeLogBlock,
    logBlockMatchesRun,
    parseDaemonLogTail,
    isGlobalDaemonLogEvent,
    capDaemonLogDetail,
    MAX_DETAIL_CHARS,
  },
};
