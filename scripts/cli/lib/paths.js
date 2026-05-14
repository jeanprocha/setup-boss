const path = require("path");

function getCliPaths(repoRoot) {
  const CLI_ROOT =
    repoRoot || path.resolve(__dirname, "..", "..", "..");
  return {
    CLI_ROOT,
    RUNS_DIR: path.join(CLI_ROOT, ".setup-boss", "runs"),
    LEGACY_OUTPUTS_DIR: path.join(CLI_ROOT, "outputs"),
  };
}

module.exports = { getCliPaths };
