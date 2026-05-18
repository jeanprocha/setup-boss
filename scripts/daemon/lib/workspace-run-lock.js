"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDaemonDirs } = require("./daemon-paths");
const { appendDaemonLog } = require("./daemon-log");
const { isPidAlive } = require("./pid-file");

function lockFilePath(workspaceRunId) {
  const id = String(workspaceRunId || "").trim();
  const hash = crypto.createHash("sha256").update(id).digest("hex").slice(0, 32);
  return path.join(getDaemonDirs().locksDir, `wsrun-${hash}.lock`);
}

function ensureLocksDir() {
  fs.mkdirSync(getDaemonDirs().locksDir, { recursive: true });
}

function lockIsStale(existing) {
  if (!existing || typeof existing !== "object") return true;
  const pidNum = Number(existing.pid);
  if (!Number.isFinite(pidNum)) return true;
  return !isPidAlive(pidNum);
}

function writeLock(workspaceRunId, payload) {
  ensureLocksDir();
  const p = lockFilePath(workspaceRunId);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

/**
 * @param {string} workspaceRunId
 * @param {{ pid: number, label?: string|null }} holder
 */
function tryAcquireWorkspaceRunLock(workspaceRunId, holder) {
  const id = String(workspaceRunId || "").trim();
  if (!id) return { ok: false, reason: "invalid_workspace_run_id" };

  ensureLocksDir();
  const p = lockFilePath(id);
  const nowIso = new Date().toISOString();

  let existing = null;
  try {
    if (fs.existsSync(p)) existing = JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    existing = null;
  }

  if (!existing || lockIsStale(existing)) {
    if (existing) {
      appendDaemonLog(
        `stale_wsrun_lock_detected workspaceRunId=${id} oldPid=${existing.pid}`,
      );
    }
    writeLock(id, {
      workspaceRunId: id,
      pid: holder.pid,
      label: holder.label || null,
      createdAt: typeof existing?.createdAt === "string" ? existing.createdAt : nowIso,
      heartbeatAt: nowIso,
    });
    return { ok: true, takeover: Boolean(existing) };
  }

  if (Number(existing.pid) === Number(holder.pid)) {
    writeLock(id, { ...existing, heartbeatAt: nowIso });
    return { ok: true, takeover: false };
  }

  return {
    ok: false,
    reason: `wsrun_lock_held pid=${existing.pid} workspaceRunId=${id}`,
  };
}

/**
 * @param {string} workspaceRunId
 * @param {number|null} expectedPid
 */
function releaseWorkspaceRunLock(workspaceRunId, expectedPid) {
  const id = String(workspaceRunId || "").trim();
  const p = lockFilePath(id);
  if (!fs.existsSync(p)) return false;

  let existing = null;
  try {
    existing = JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    fs.unlinkSync(p);
    return true;
  }

  if (expectedPid != null && Number(existing.pid) !== Number(expectedPid)) return false;
  fs.unlinkSync(p);
  appendDaemonLog(`wsrun_lock_released workspaceRunId=${id}`);
  return true;
}

/**
 * @param {string} workspaceRunId
 * @param {{ label?: string|null }} [holderMeta]
 * @param {() => Promise<unknown>|(() => unknown)} fn
 */
async function runWithWorkspaceRunLock(workspaceRunId, holderMeta, fn) {
  const holder = { pid: process.pid, label: holderMeta?.label || "workspace_orchestrator" };
  const ac = tryAcquireWorkspaceRunLock(workspaceRunId, holder);
  if (!ac.ok) {
    return {
      ok: false,
      code: "workspace_run_orchestration_busy",
      message: ac.reason || "WorkspaceRun em orquestração por outro processo.",
    };
  }

  let released = false;
  function safeRelease() {
    if (released) return;
    released = true;
    try {
      releaseWorkspaceRunLock(workspaceRunId, holder.pid);
    } catch (_) {
      /* */
    }
  }

  try {
    return await fn();
  } finally {
    safeRelease();
  }
}

function recoverStaleWorkspaceRunLocksOnDisk() {
  ensureLocksDir();
  const { locksDir } = getDaemonDirs();
  let cleared = 0;
  try {
    for (const f of fs.readdirSync(locksDir)) {
      if (!f.startsWith("wsrun-") || !f.endsWith(".lock")) continue;
      const full = path.join(locksDir, f);
      try {
        const existing = JSON.parse(fs.readFileSync(full, "utf-8"));
        if (lockIsStale(existing)) {
          fs.unlinkSync(full);
          cleared += 1;
          appendDaemonLog(`recovery_cleared_stale_wsrun_lock file=${full}`);
        }
      } catch (_) {
        fs.unlinkSync(full);
        cleared += 1;
      }
    }
  } catch (_) {
    /* */
  }
  return cleared;
}

module.exports = {
  tryAcquireWorkspaceRunLock,
  releaseWorkspaceRunLock,
  runWithWorkspaceRunLock,
  recoverStaleWorkspaceRunLocksOnDisk,
  lockIsStale,
};
