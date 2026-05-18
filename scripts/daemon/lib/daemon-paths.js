const path = require("path");
const os = require("os");
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
    workspacesPath: path.join(base, "workspaces.json"),
    workspaceRunsDir: path.join(base, "workspace-runs"),
    workspaceRunsIndexPath: path.join(base, "workspace-runs", "index.json"),
  };
}

/**
 * Directório onde o daemon clona projectos Git registados via API.
 * `SETUP_BOSS_PROJECTS_DIR` (absoluto) tem prioridade; por defeito `~/setup-boss-projects`.
 */
function getManagedProjectsRoot() {
  const env = process.env.SETUP_BOSS_PROJECTS_DIR;
  if (env != null && String(env).trim()) {
    return path.resolve(String(env).trim());
  }
  const home = os.homedir();
  if (home && String(home).trim()) {
    return path.join(String(home).trim(), "setup-boss-projects");
  }
  return path.join(getDaemonDirs().setupBossDir, "git-projects");
}

module.exports = { getDaemonDirs, getManagedProjectsRoot };
