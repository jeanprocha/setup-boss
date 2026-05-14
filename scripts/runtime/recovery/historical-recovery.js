/**
 * Heurísticas leves a partir de runs anteriores (local, sem ML).
 */

const fs = require("fs");
const path = require("path");
const { HISTORY_NAME, summarizeRecoveryFromArtifacts } = require("./recovery-artifacts");

function listRunOutputDirs(projectOutputsDir, limit = 12) {
  if (!projectOutputsDir || !fs.existsSync(projectOutputsDir)) return [];
  let names;
  try {
    names = fs.readdirSync(projectOutputsDir);
  } catch (_) {
    return [];
  }
  const dirs = [];
  for (const n of names) {
    const p = path.join(projectOutputsDir, n);
    try {
      if (fs.statSync(p).isDirectory()) dirs.push(p);
    } catch (_) {
      /* ignore */
    }
  }
  dirs.sort((a, b) => {
    const ta = fs.statSync(a).mtimeMs;
    const tb = fs.statSync(b).mtimeMs;
    return tb - ta;
  });
  return dirs.slice(0, limit);
}

function buildHistoricalRecoveryHints(projectOutputsDir, currentOutputDir) {
  const dirs = listRunOutputDirs(projectOutputsDir, 14);
  let providerRetries = 0;
  let microRetries = 0;
  let runsWithRecovery = 0;

  for (const d of dirs) {
    if (currentOutputDir && path.resolve(d) === path.resolve(currentOutputDir)) {
      continue;
    }
    const hPath = path.join(d, HISTORY_NAME);
    if (!fs.existsSync(hPath)) continue;
    const s = summarizeRecoveryFromArtifacts(d);
    if (s.recovery_events > 0) runsWithRecovery += 1;
    providerRetries += s.provider_retries;
    microRetries += s.executor_micro_retries;
  }

  const warnings = [];
  if (runsWithRecovery >= 3 && microRetries >= 3) {
    warnings.push(
      "Histórico recente: várias runs com micro-retries do executor — considere ampliar preflight/escopo ou ajustar snippets manualmente.",
    );
  }
  if (providerRetries >= 4) {
    warnings.push(
      "Histórico recente: muitos retries de provider — verifique rede, quotas ou timeouts.",
    );
  }

  return {
    runs_with_recovery_sampled: runsWithRecovery,
    provider_retries_sum: providerRetries,
    executor_micro_retries_sum: microRetries,
    warnings,
  };
}

module.exports = {
  buildHistoricalRecoveryHints,
  listRunOutputDirs,
};
