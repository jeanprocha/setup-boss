/**
 * Compara estimativas do preflight com métricas reais da corrida (feedback loop).
 */

const fs = require("fs");
const path = require("path");
const { readJsonSafe } = require("../../cli/lib/json-io");

function writePreflightAccuracy(outputDir) {
  if (!outputDir) return null;

  const dir = path.resolve(outputDir);
  const prePath = path.join(dir, "preflight-analysis.json");
  if (!fs.existsSync(prePath)) return null;

  const pre = readJsonSafe(prePath, 3_000_000, null);
  if (!pre || typeof pre !== "object") return null;

  const rm = readJsonSafe(path.join(dir, "run-metrics.json"), 3_000_000, null);
  const meta = readJsonSafe(path.join(dir, "metadata.json"), 3_000_000, null);
  const ch = readJsonSafe(path.join(dir, "executor-changes.json"), 3_000_000, []);
  const rl = readJsonSafe(path.join(dir, "run-log.json"), 3_000_000, null);

  const actualPromptChars =
    rm && rm.totals && typeof rm.totals.prompt_chars_sum_steps === "number"
      ? rm.totals.prompt_chars_sum_steps
      : null;
  const actualTokens =
    rm && rm.totals && typeof rm.totals.prompt_est_tokens_sum === "number"
      ? rm.totals.prompt_est_tokens_sum
      : null;

  const actualCost =
    meta &&
    meta.llm_usage_total &&
    typeof meta.llm_usage_total.estimated_cost_usd === "number"
      ? meta.llm_usage_total.estimated_cost_usd
      : null;

  const actualFiles = Array.isArray(ch) ? ch.length : null;
  const actualCorrections =
    rl && typeof rl.correction_iterations === "number"
      ? rl.correction_iterations
      : null;

  const estChars = pre.prompts && pre.prompts.totals
    ? pre.prompts.totals.est_prompt_chars_sum
    : null;
  const estTokensMid = pre.prompts && pre.prompts.totals
    ? pre.prompts.totals.est_tokens_sum
    : null;

  const estCostMid = pre.cost ? pre.cost.estimated_cost_usd_mid : null;

  const estFilesMid =
    pre.scope
      ? Math.round(
          ((pre.scope.estimated_files_min || 0) +
            (pre.scope.estimated_files_max || 0)) /
            2,
        )
      : null;

  function ratio(actual, est) {
    if (
      actual == null ||
      est == null ||
      !Number.isFinite(actual) ||
      !Number.isFinite(est) ||
      est === 0
    ) {
      return null;
    }
    return Number((actual / est).toFixed(4));
  }

  const accuracy = {
    schema_version: "2.4c",
    generated_at: new Date().toISOString(),
    deltas: {
      prompt_chars_est: estChars,
      prompt_chars_actual: actualPromptChars,
      prompt_chars_ratio: ratio(actualPromptChars, estChars),

      tokens_est_mid: estTokensMid,
      tokens_actual: actualTokens,
      tokens_ratio: ratio(actualTokens, estTokensMid),

      cost_est_mid: estCostMid,
      cost_actual: actualCost,
      cost_ratio: ratio(actualCost, estCostMid),

      files_est_mid: estFilesMid,
      files_actual: actualFiles,
      files_delta:
        actualFiles != null && estFilesMid != null
          ? actualFiles - estFilesMid
          : null,

      corrections_actual: actualCorrections,
      correction_probability_preflight:
        pre.correction && pre.correction.probability_label,
    },
    notes: [
      "Rácios > 1 significam actual acima da estimativa central.",
      "Uso futuro: médias adaptativas por projeto sem APIs externas.",
    ],
  };

  try {
    fs.writeFileSync(
      path.join(dir, "preflight-accuracy.json"),
      JSON.stringify(accuracy, null, 2),
      "utf-8",
    );
  } catch (_) {
    return null;
  }

  return accuracy;
}

module.exports = {
  writePreflightAccuracy,
};
