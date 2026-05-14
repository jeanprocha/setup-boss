const path = require("path");

/** Raiz do repositório setup-boss (onde mora `scripts/` e `.setup-boss/`). Alinha com SETUP_BOSS_CLI_ROOT quando definido. */
function getSetupBossRepoRoot() {
  const raw = process.env.SETUP_BOSS_CLI_ROOT;

  if (raw && String(raw).trim())
    return path.resolve(String(raw).trim());

  return path.resolve(__dirname, "..", "..", "..");
}

module.exports = { getSetupBossRepoRoot };
