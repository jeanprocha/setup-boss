const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDaemonDirs } = require("./daemon-paths");
const { appendDaemonLog } = require("./daemon-log");
const { isPidAlive } = require("./pid-file");

function hashProjectRoot(projectRootAbs) {
  const n = path.normalize(path.resolve(projectRootAbs));
  return crypto.createHash("sha256").update(n).digest("hex").slice(0, 48);
}

function lockFilePath(projectRootAbs) {
  const { locksDir } = getDaemonDirs();
  return path.join(locksDir, `${hashProjectRoot(projectRootAbs)}.lock`);
}

function ensureLocksDir() {
  const { locksDir } = getDaemonDirs();
  fs.mkdirSync(locksDir, { recursive: true });
}

function readLock(projectRootAbs) {
  const p = lockFilePath(projectRootAbs);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

function lockIsStale(existing) {
  if (!existing || typeof existing !== "object") return true;

  const pidNum = Number(existing.pid);

  if (!Number.isFinite(pidNum)) return true;

  /** Processo vivo: lock válido (execuções sincronas longas sem heartbeat). */
  if (isPidAlive(pidNum)) return false;

  return true;
}

function writeLock(projectRootAbs, payload) {
  ensureLocksDir();
  const p = lockFilePath(projectRootAbs);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

/**
 * Tenta criar/obter exclusividade no projeto.
 * @returns {{ ok: boolean, reason?: string, takeover?: boolean }}
 */
function tryAcquireProjectLock(projectRootAbs, holder) {
  ensureLocksDir();
  const normalizedRoot = path.normalize(path.resolve(projectRootAbs));
  const nowIso = new Date().toISOString();
  const p = lockFilePath(normalizedRoot);

  let existing = null;
  try {
    if (fs.existsSync(p)) existing = JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    appendDaemonLog(
      `WARN lock corrupto em ${p}; tratando como stale e substituindo`,
    );
    existing = null;
  }

  if (!existing || lockIsStale(existing)) {
    if (existing) {
      appendDaemonLog(
        `stale_lock_detected project=${normalizedRoot} oldPid=${existing.pid} job=${existing.jobId || ""}`,
      );
    }

    writeLock(normalizedRoot, {
      projectRoot: normalizedRoot,
      jobId: holder.jobId,
      pid: holder.pid,
      label: holder.label || null,
      createdAt:
        typeof existing?.createdAt === "string" ? existing.createdAt : nowIso,
      heartbeatAt: nowIso,
    });
    return { ok: true, takeover: Boolean(existing) };
  }

  const samePid = Number(existing.pid) === Number(holder.pid);
  const sameJob =
    holder.jobId && existing.jobId && existing.jobId === holder.jobId;
  if (samePid && sameJob) {
    const next = {
      ...existing,
      heartbeatAt: nowIso,
    };
    writeLock(normalizedRoot, next);
    return { ok: true, takeover: false };
  }

  return {
    ok: false,
    reason: `lock_held pid=${existing.pid} job=${existing.jobId}`,
  };
}

function releaseProjectLock(projectRootAbs, expectedJobId, expectedPid) {
  const normalizedRoot = path.normalize(path.resolve(projectRootAbs));
  const p = lockFilePath(normalizedRoot);
  if (!fs.existsSync(p)) return false;
  let existing = null;

  try {
    existing = JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    fs.unlinkSync(p);
    appendDaemonLog(
      `lock released_invalid_json project=${normalizedRoot}`,
    );
    return true;
  }

  if (
    expectedJobId != null &&
    existing.jobId &&
    existing.jobId !== expectedJobId
  ) {
    appendDaemonLog(
      `WARN release ignorado — job mismatch project=${normalizedRoot}`,
    );
    return false;
  }

  if (expectedPid != null && Number(existing.pid) !== Number(expectedPid))
    return false;

  fs.unlinkSync(p);
  appendDaemonLog(
    `lock_released project=${normalizedRoot} job=${expectedJobId}`,
  );
  return true;
}

function heartbeatProjectLock(projectRootAbs, holder) {
  return tryAcquireProjectLock(projectRootAbs, holder).ok === true;
}

async function runWithProjectLock(projectRootAbs, holder, fn) {
  const ac = tryAcquireProjectLock(projectRootAbs, holder);

  if (!ac.ok) {
    const err = new Error(ac.reason || "LOCK_NOT_AVAILABLE");
    err.code = "PROJECT_LOCKED";

    throw err;
  }

  let released = false;

  function safeRelease() {
    if (released) return;
    released = true;

    try {
      releaseProjectLock(projectRootAbs, holder.jobId, holder.pid);
    } catch (_) {
      /* */
    }

    try {
      process.removeListener("exit", onExitRelease);
    } catch (_) {
      /* */
    }
  }

  function onExitRelease() {
    safeRelease();
  }

  process.once("exit", onExitRelease);

  try {
    return await fn();
  } finally {
    safeRelease();
  }
}

function recoverStaleLocksOnDisk() {
  ensureLocksDir();
  const { locksDir } = getDaemonDirs();

  let cleared = 0;

  try {
    const files = fs.readdirSync(locksDir);

    for (const f of files) {
      if (!f.endsWith(".lock")) continue;
      const full = path.join(locksDir, f);

      let existing = null;

      try {
        existing = JSON.parse(fs.readFileSync(full, "utf-8"));

        const root = existing.projectRoot;
        if (root && lockIsStale(existing)) {
          fs.unlinkSync(full);

          cleared += 1;
          appendDaemonLog(`recovery_cleared_stale_lock file=${full}`);
        }
      } catch (_) {
        fs.unlinkSync(full);

        cleared += 1;

        appendDaemonLog(`recovery_removed_invalid_lock file=${full}`);
      }
    }
  } catch (_) {
    /* */
  }

  return cleared;
}

module.exports = {
  tryAcquireProjectLock,
  releaseProjectLock,
  heartbeatProjectLock,
  readLock,
  lockIsStale,
  recoverStaleLocksOnDisk,
  hashProjectRoot,
  runWithProjectLock,
};
