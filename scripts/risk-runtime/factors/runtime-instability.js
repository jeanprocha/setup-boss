/**
 * Fator: runtime_instability (Fase 4.3).
 */

const { baseScoreFromSeverity } = require("../policies/risk-policies");

function readRunLogIterations(outputDir, fs) {
  try {
    const p = require("path").join(String(outputDir || ""), "run-log.json");
    if (!fs.existsSync(p)) return { iterations: 0, errors: 0, warnings: 0 };
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
      iterations: typeof j.correction_iterations === "number" ? j.correction_iterations : 0,
      errors: Array.isArray(j.errors) ? j.errors.length : 0,
      warnings: Array.isArray(j.warnings) ? j.warnings.length : 0,
    };
  } catch (_) {
    return { iterations: 0, errors: 0, warnings: 0 };
  }
}

/**
 * @param {object} ctx
 */
function evaluateRuntimeInstability(ctx) {
  const fs = require("fs");
  const log = readRunLogIterations(ctx.outputDir, fs);
  const retries =
    ctx.telemetrySnapshot && typeof ctx.telemetrySnapshot.executor_retries === "number"
      ? ctx.telemetrySnapshot.executor_retries
      : 0;

  const signals = log.iterations + Math.min(5, retries) + Math.min(3, Math.floor(log.errors / 2));

  let severity = "low";
  if (signals >= 6) severity = "critical";
  else if (signals >= 4) severity = "high";
  else if (signals >= 2) severity = "moderate";

  const score = signals === 0 ? 6 : baseScoreFromSeverity(severity);

  return {
    factor_id: "runtime_instability.v1",
    type: "runtime_instability",
    severity,
    score,
    weight: 1,
    source: "run-log.json+telemetry_snapshot",
    reason: `correction_iterations=${log.iterations}, log_errors=${log.errors}, executor_retries=${retries}.`,
    evidence: {
      correction_iterations: log.iterations,
      log_errors: log.errors,
      log_warnings: log.warnings,
      executor_retries: retries,
    },
    metadata: {},
  };
}

module.exports = { evaluateRuntimeInstability };
