"use strict";

const fs = require("fs");
const path = require("path");
const { getDaemonDirs } = require("./daemon-paths");

const SCHEMA = 1;

/**
 * @typedef {{ archivedAt: string, runId?: string|null, jobId?: string|null }} ArchiveEntry
 * @typedef {{ schemaVersion: number, entries: Record<string, ArchiveEntry> }} ArchiveFile
 */

function archiveFilePath() {
  return path.join(getDaemonDirs().setupBossDir, "run-archive.json");
}

function defaultPayload() {
  return { schemaVersion: SCHEMA, entries: {} };
}

/** @returns {ArchiveFile} */
function loadRunArchiveUnsafe() {
  const p = archiveFilePath();
  if (!fs.existsSync(p)) return defaultPayload();
  try {
    const o = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (!o || typeof o !== "object" || o.entries == null || typeof o.entries !== "object") {
      return defaultPayload();
    }
    o.schemaVersion = SCHEMA;
    return /** @type {ArchiveFile} */ (o);
  } catch (_) {
    return defaultPayload();
  }
}

/** @param {ArchiveFile} data */
function saveRunArchive(data) {
  const p = archiveFilePath();
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

/**
 * @param {object} job
 * @returns {string[]}
 */
function jobArchiveKeys(job) {
  /** @type {string[]} */
  const keys = [];
  const jid = job && job.id != null ? String(job.id).trim() : "";
  const rid = job && job.runId != null ? String(job.runId).trim() : "";
  if (jid) keys.push(`job:${jid}`);
  if (rid) keys.push(`run:${rid}`);
  return keys;
}

/**
 * @param {object} job
 * @param {ArchiveFile} file
 */
function isJobArchived(job, file) {
  const keys = jobArchiveKeys(job);
  for (const k of keys) {
    if (file.entries[k]) return true;
  }
  return false;
}

/**
 * @param {{ setupBossDir: string }} dirs
 * @param {string} runId
 * @param {string} archivedAt
 */
function mergeIntoRunIndexFile(dirs, runId, archivedAt) {
  const idxPath = path.join(dirs.setupBossDir, "runs", `${runId}.json`);
  if (!fs.existsSync(idxPath)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
    if (!raw || typeof raw !== "object") return;
    raw.archived = true;
    raw.archivedAt = archivedAt;
    fs.writeFileSync(idxPath, JSON.stringify(raw, null, 2), "utf-8");
  } catch (_) {
    /* não bloquear */
  }
}

/**
 * @param {object} job
 * @returns {{ ok: boolean, archivedAt: string, keys: string[] }}
 */
function archiveJobRecord(job) {
  if (!job || job.id == null) {
    return { ok: false, archivedAt: null, keys: [] };
  }
  const file = loadRunArchiveUnsafe();
  const now = new Date().toISOString();
  const keys = jobArchiveKeys(job);

  for (const k of keys) {
    file.entries[k] = {
      archivedAt: now,
      runId: job.runId != null ? String(job.runId) : null,
      jobId: String(job.id),
    };
  }

  saveRunArchive(file);

  const rid = job.runId != null ? String(job.runId).trim() : "";
  if (rid) {
    mergeIntoRunIndexFile(getDaemonDirs(), rid, now);
  }

  return { ok: true, archivedAt: now, keys };
}

/**
 * Remove entradas de arquivo associadas ao job (lista principal / arquivadas).
 * @param {object} job
 * @returns {{ ok: true, removed: number }}
 */
function removeArchiveEntriesForJob(job) {
  if (!job || job.id == null) return { ok: true, removed: 0 };

  const file = loadRunArchiveUnsafe();

  const keys = jobArchiveKeys(job);

  let removed = 0;

  for (const key of keys) {
    if (file.entries[key]) {
      delete file.entries[key];

      removed += 1;
    }
  }

  if (removed > 0) saveRunArchive(file);

  return { ok: true, removed };
}

/**
 * @param {string} runId
 * @returns {{ ok: true, removed: number }}
 */
function removeArchiveEntriesForRunId(runId) {
  const rid = String(runId || "").trim();
  if (!rid) return { ok: true, removed: 0 };

  const file = loadRunArchiveUnsafe();
  /** @type {string[]} */
  const keys = [`run:${rid}`];

  for (const [key, entry] of Object.entries(file.entries)) {
    if (entry && entry.runId != null && String(entry.runId).trim() === rid) {
      keys.push(key);
    }
  }

  let removed = 0;
  for (const key of keys) {
    if (file.entries[key]) {
      delete file.entries[key];
      removed += 1;
    }
  }

  if (removed > 0) saveRunArchive(file);
  return { ok: true, removed };
}

module.exports = {
  archiveFilePath,
  loadRunArchiveUnsafe,
  saveRunArchive,
  isJobArchived,
  archiveJobRecord,
  removeArchiveEntriesForJob,
  removeArchiveEntriesForRunId,
};
