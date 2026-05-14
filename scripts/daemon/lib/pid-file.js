const fs = require("fs");
const { getDaemonDirs } = require("./daemon-paths");

function readDaemonPidRaw() {
  const { pidPath } = getDaemonDirs();
  if (!fs.existsSync(pidPath)) return null;
  const raw = String(fs.readFileSync(pidPath, "utf-8")).trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** @returns {boolean} */
function writePid(pid) {
  const { daemonDir, pidPath } = getDaemonDirs();
  fs.mkdirSync(daemonDir, { recursive: true });
  fs.writeFileSync(pidPath, String(pid), "utf-8");
  return true;
}

function deletePidFile() {
  const { pidPath } = getDaemonDirs();
  try {
    fs.unlinkSync(pidPath);
  } catch (_) {
    /* ok */
  }
}

/** Cross-plataforma tentativa não-destrutiva de PID vivo. */
function isPidAlive(pid) {
  if (pid == null || !Number.isFinite(pid)) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  readDaemonPidRaw,
  writePid,
  deletePidFile,
  isPidAlive,
};
