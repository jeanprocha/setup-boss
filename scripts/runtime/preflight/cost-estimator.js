/**
 * Estimativa de chars/tokens/custo por etapa (heurística local).
 */

const { estimateCostUsd } = require("../../../core/llm-usage");
const { getModelForStep } = require("../../../core/llm-client");

function numEnv(k, fallback) {
  const raw = process.env[k];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function roughTokens(chars) {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.round(chars / 4);
}

/**
 * Razões input/output empíricas por etapa (aproximação quando só há total).
 */
const IO_RATIO = {
  scan: { in: 0.88, out: 0.12 },
  architect: { in: 0.82, out: 0.18 },
  executor: { in: 0.78, out: 0.22 },
  review: { in: 0.72, out: 0.28 },
  correction: { in: 0.8, out: 0.2 },
};

function stepCostUsd(stepKey, totalChars) {
  const tokens = roughTokens(totalChars);
  const ratio = IO_RATIO[stepKey] || IO_RATIO.architect;
  const input_tokens = Math.round(tokens * ratio.in);
  const output_tokens = Math.max(0, tokens - input_tokens);
  const model = getModelForStep(stepKey);
  const cost =
    estimateCostUsd(model, input_tokens, output_tokens) ??
    null;
  return { model, input_tokens, output_tokens, estimated_cost_usd: cost };
}

function estimateStageChars({
  taskChars,
  estimatedFilesMid,
  projectLite,
  historicalAvgPrompt,
  scanUsesCache,
}) {
  const scanTreeCap = numEnv("SCAN_FILE_TREE_MAX_CHARS", 12000);
  const scanDocsCap = numEnv("SCAN_OPERATIONAL_DOCS_MAX_CHARS", 12000);
  const scanCtxCap = numEnv("SCAN_GLOBAL_CONTEXT_MAX_CHARS", 6000);
  const archScanCap = numEnv("ARCHITECT_PROJECT_SCAN_MAX_CHARS", 8000);
  const snippetCap = numEnv("EXECUTOR_CONTEXT_SNIPPET_SIZE", 6000);

  const projBoost =
    projectLite && typeof projectLite.fileCount === "number"
      ? Math.min(9000, Math.round(Math.log10(projectLite.fileCount + 10) * 3500))
      : 2500;

  let scanChars =
    Math.round(scanTreeCap * 0.92 + scanDocsCap * 0.55 + scanCtxCap * 0.85) +
    taskChars +
    Math.round(projBoost * 0.4);
  if (scanUsesCache) scanChars = Math.round(scanChars * 0.28);

  const architectChars =
    archScanCap +
    taskChars * 3 +
    Math.round(projBoost * 0.55) +
    5200;

  const executorChars =
    estimatedFilesMid * snippetCap * 1.05 +
    taskChars * 2 +
    7500 +
    Math.round(estimatedFilesMid * 420);

  const reviewChars =
    Math.round(executorChars * 0.34) + taskChars + 4200;

  const correctionChars =
    Math.round(executorChars * 0.22 + taskChars * 1.5) +
    2800;

  const histFactor =
    historicalAvgPrompt != null &&
    Number.isFinite(historicalAvgPrompt) &&
    historicalAvgPrompt > 5000
      ? Math.min(
          1.65,
          0.82 + historicalAvgPrompt / Math.max(scanChars + architectChars, 1),
        )
      : 1;

  const scaled = {
    scan: Math.round(scanChars * histFactor),
    architect: Math.round(architectChars * histFactor),
    executor: Math.round(executorChars * histFactor),
    review: Math.round(reviewChars * histFactor),
    correction: Math.round(correctionChars * histFactor),
  };

  const baselineSum =
    scaled.scan +
    scaled.architect +
    scaled.executor +
    scaled.review +
    scaled.correction;

  const inflationFactor =
    historicalAvgPrompt != null &&
    Number.isFinite(historicalAvgPrompt) &&
    baselineSum > 1000
      ? Math.min(1.45, historicalAvgPrompt / baselineSum)
      : 1;

  for (const k of Object.keys(scaled)) {
    scaled[k] = Math.round(scaled[k] * inflationFactor);
  }

  return {
    by_stage_chars: scaled,
    inflation_factor_applied: Number(inflationFactor.toFixed(4)),
    baseline_chars_sum_before_inflation: baselineSum,
  };
}

function summarizeCosts(byStageChars) {
  const detail = {};
  let sumTokens = 0;
  let sumCost = 0;
  let anyCost = false;

  for (const [step, chars] of Object.entries(byStageChars)) {
    const t = roughTokens(chars);
    sumTokens += t;
    const c = stepCostUsd(step, chars);
    detail[step] = {
      est_prompt_chars: chars,
      est_tokens: t,
      model: c.model,
      estimated_cost_usd: c.estimated_cost_usd,
    };
    if (typeof c.estimated_cost_usd === "number") {
      sumCost += c.estimated_cost_usd;
      anyCost = true;
    }
  }

  const pessimisticTokens = Math.round(sumTokens * 1.35);
  const optimisticTokens = Math.round(sumTokens * 0.72);
  const pessimisticCost = anyCost ? Number((sumCost * 1.45).toFixed(4)) : null;
  const optimisticCost = anyCost ? Number((sumCost * 0.62).toFixed(4)) : null;

  return {
    steps: detail,
    totals: {
      est_prompt_chars_sum: Object.values(byStageChars).reduce((a, b) => a + b, 0),
      est_tokens_sum: sumTokens,
      est_tokens_optimistic: optimisticTokens,
      est_tokens_pessimistic: pessimisticTokens,
      estimated_cost_usd_mid: anyCost ? Number(sumCost.toFixed(4)) : null,
      estimated_cost_usd_optimistic: optimisticCost,
      estimated_cost_usd_pessimistic: pessimisticCost,
      pricing_available: anyCost,
    },
  };
}

module.exports = {
  estimateStageChars,
  summarizeCosts,
  roughTokens,
};
