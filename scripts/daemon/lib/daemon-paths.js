const path = require("path");
const { getSetupBossRepoRoot } = require("./repo-root");

/**
 * Estado persistido (fila, locks, events): por defeito `<repo>/.setup-boss`.
 * `SETUP_BOSS_DATA_DIR` permite isolar o mesmo checkout (ex.: testes E2E / CI).
 */
function getDaemonDirs() {
  const repoRoot = getSetupBossRepoRoot();
  const envData = process.env.SETUP_BOSS_DATA_DIR;
  const base =
    envData && String(envData).trim()
      ? path.resolve(String(envData).trim())
      : path.join(repoRoot, ".setup-boss");
  return {
    repoRoot,
    setupBossDir: base,
    daemonDir: path.join(base, "daemon"),
    locksDir: path.join(base, "locks"),
    pidPath: path.join(base, "daemon", "pid"),
    statusPath: path.join(base, "daemon", "status.json"),
    logPath: path.join(base, "daemon", "daemon.log"),
    queuePath: path.join(base, "daemon", "queue.json"),
    queueLockPath: path.join(base, "daemon", "queue.lock"),
    projectsPath: path.join(base, "projects.json"),
  };
}

module.exports = { getDaemonDirs };
