const fs = require("fs");
const path = require("path");

function modelPricingEnvPrefix(model) {
  return String(model || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function parseUsdPerMillion(envKey) {
  const raw = process.env[envKey];

  if (raw === undefined || raw === "") {
    return null;
  }

  const n = Number(raw);

  if (!Number.isFinite(n)) {
    return null;
  }

  return n;
}

function estimateCostUsd(model, inputTokens, outputTokens) {
  const prefix = modelPricingEnvPrefix(model);

  if (!prefix) {
    return null;
  }

  const inputRate = parseUsdPerMillion(`${prefix}_INPUT_USD_PER_1M`);
  const outputRate = parseUsdPerMillion(`${prefix}_OUTPUT_USD_PER_1M`);

  if (inputRate === null || outputRate === null) {
    return null;
  }

  const cost =
    (inputTokens / 1_000_000) * inputRate +
    (outputTokens / 1_000_000) * outputRate;

  return Number(cost.toFixed(6));
}

function normalizeUsage(usage) {
  const fallback = {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: null,
  };

  if (!usage || typeof usage !== "object") {
    return { ...fallback };
  }

  const inputRaw =
    usage.input_tokens ?? usage.prompt_tokens ?? usage.input ?? 0;

  const outputRaw =
    usage.output_tokens ??
    usage.completion_tokens ??
    usage.output ??
    0;

  let input_tokens = Number(inputRaw);
  let output_tokens = Number(outputRaw);

  if (!Number.isFinite(input_tokens) || input_tokens < 0) input_tokens = 0;
  if (!Number.isFinite(output_tokens) || output_tokens < 0) output_tokens = 0;

  let total_tokens = Number(usage.total_tokens ?? 0);

  if (!Number.isFinite(total_tokens) || total_tokens < 0) {
    total_tokens = 0;
  }

  if (!total_tokens && (input_tokens || output_tokens)) {
    total_tokens = input_tokens + output_tokens;
  }

  return {
    input_tokens,
    output_tokens,
    total_tokens,
    estimated_cost_usd: null,
  };
}

function mergeStepUsage(prevEntry, normalized, model) {
  const input_tokens = (prevEntry?.input_tokens || 0) + normalized.input_tokens;
  const output_tokens =
    (prevEntry?.output_tokens || 0) + normalized.output_tokens;
  const total_tokens = input_tokens + output_tokens;

  return {
    model: model || prevEntry?.model || "",
    input_tokens,
    output_tokens,
    total_tokens,
    estimated_cost_usd: estimateCostUsd(model, input_tokens, output_tokens),
  };
}

function recomputeTotals(llmUsage) {
  const empty = {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: null,
  };

  if (!llmUsage || typeof llmUsage !== "object") {
    return { ...empty };
  }

  let input_tokens = 0;
  let output_tokens = 0;
  let total_tokens = 0;
  let costSum = 0;
  let anyNumericCost = false;

  for (const entry of Object.values(llmUsage)) {
    if (!entry || typeof entry !== "object") continue;

    input_tokens += Number(entry.input_tokens || 0);
    output_tokens += Number(entry.output_tokens || 0);
    total_tokens += Number(entry.total_tokens || 0);

    if (typeof entry.estimated_cost_usd === "number") {
      costSum += entry.estimated_cost_usd;
      anyNumericCost = true;
    }
  }

  return {
    input_tokens,
    output_tokens,
    total_tokens,
    estimated_cost_usd: anyNumericCost ? Number(costSum.toFixed(6)) : null,
  };
}

function formatCostForLog(estimated_cost_usd) {
  if (estimated_cost_usd === null || estimated_cost_usd === undefined) {
    return "unknown";
  }

  if (typeof estimated_cost_usd !== "number") {
    return "unknown";
  }

  return `$${estimated_cost_usd.toFixed(4)}`;
}

function logCompactUsage(step, snapshot) {
  const label = String(step || "llm");

  console.log(`🤖 ${label} model: ${snapshot.model || "(unknown)"}`);
  console.log(
    `📊 ${label} tokens: input=${snapshot.input_tokens} output=${snapshot.output_tokens} total=${snapshot.total_tokens} cost=${formatCostForLog(snapshot.estimated_cost_usd)}`
  );
}

function patchRunLogWithLlmUsage(resolvedOutputDir, step, snapshot) {
  const logPath = path.join(resolvedOutputDir, "run-log.json");

  if (!fs.existsSync(logPath)) {
    return;
  }

  let data;

  try {
    data = JSON.parse(fs.readFileSync(logPath, "utf-8"));
  } catch (_) {
    return;
  }

  if (!data || !Array.isArray(data.steps)) {
    return;
  }

  const target = String(step || "").toLowerCase();

  for (let i = data.steps.length - 1; i >= 0; i--) {
    const s = data.steps[i];

    if (
      s &&
      String(s.name || "").toLowerCase() === target &&
      s.status === "running"
    ) {
      s.llm_usage = { ...snapshot };
      fs.writeFileSync(logPath, JSON.stringify(data, null, 2), "utf-8");
      return;
    }
  }
}

function recordLLMUsage({ outputDir, step, model, usage }) {
  const stepKey = String(step || "unknown").toLowerCase();
  const normalized = normalizeUsage(usage);

  const invocationSnapshot = {
    model: model || "",
    input_tokens: normalized.input_tokens,
    output_tokens: normalized.output_tokens,
    total_tokens:
      normalized.total_tokens ||
      normalized.input_tokens + normalized.output_tokens,
    estimated_cost_usd: estimateCostUsd(
      model,
      normalized.input_tokens,
      normalized.output_tokens
    ),
  };

  logCompactUsage(stepKey, invocationSnapshot);

  if (
    outputDir === undefined ||
    outputDir === null ||
    String(outputDir).trim() === ""
  ) {
    return;
  }

  const resolvedDir = path.resolve(outputDir);

  const metaPath = path.join(resolvedDir, "metadata.json");

  try {
    let metadata = {};

    if (fs.existsSync(metaPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      } catch (_) {
        metadata = {};
      }
    }

    metadata.llm_usage = metadata.llm_usage || {};

    metadata.llm_usage[stepKey] = mergeStepUsage(
      metadata.llm_usage[stepKey],
      normalized,
      model
    );

    metadata.llm_usage_total = recomputeTotals(metadata.llm_usage);

    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
  } catch (err) {
    console.log(
      `⚠️ llm_usage: falha ao atualizar metadata.json (${err.message || err})`
    );
  }

  patchRunLogWithLlmUsage(resolvedDir, stepKey, invocationSnapshot);
}

module.exports = {
  normalizeUsage,
  estimateCostUsd,
  recordLLMUsage,
};
