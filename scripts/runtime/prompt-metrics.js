const fs = require("fs");
const path = require("path");

function charsToRoughTokens(chars) {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.round(chars / 4);
}

function readJsonSafe(p, fallback = null) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return fallback;
  }
}

function rankBlockInflation(promptSizes) {
  const perStep = {};
  let globalRanked = [];

  for (const [step, rec] of Object.entries(promptSizes || {})) {
    const blocks = rec && rec.blocks ? rec.blocks : {};
    const pairs = Object.entries(blocks).map(([name, n]) => ({
      step,
      block: name,
      chars: typeof n === "number" ? n : 0,
      est_tokens: charsToRoughTokens(
        typeof n === "number" ? n : 0,
      ),
    }));
    pairs.sort((a, b) => b.chars - a.chars);
    perStep[step] = pairs.slice(0, 12);
    globalRanked = globalRanked.concat(pairs);
  }

  globalRanked.sort((a, b) => b.chars - a.chars);

  return {
    per_step: perStep,
    top_global: globalRanked.slice(0, 20),
  };
}

function computeInflationScore(promptSizes) {
  let total = 0;
  let agentChars = 0;
  for (const rec of Object.values(promptSizes || {})) {
    const blocks = rec && rec.blocks ? rec.blocks : {};
    for (const [k, v] of Object.entries(blocks)) {
      const n = typeof v === "number" ? v : 0;
      total += n;
      if (String(k).includes("agent") || k === "reviewer_agent") {
        agentChars += n;
      }
    }
  }
  const contextLike = Math.max(0, total - agentChars);
  return total > 0 ? contextLike / total : 0;
}

/**
 * Persiste run-metrics.json com telemetria de economia de contexto.
 */
function writeRunMetricsFromRun(outputDir, extras = {}) {
  if (!outputDir) return;

  const dir = path.resolve(outputDir);
  if (!fs.existsSync(dir)) return;

  const promptPath = path.join(dir, "prompt-sizes.json");
  const promptSizes = readJsonSafe(promptPath, {});

  const telemetryCounts = extras.telemetryCounts && typeof extras.telemetryCounts === "object"
    ? extras.telemetryCounts
    : {};

  const execEcon = extras.executorSnippetEconomics || null;
  const scanMeta = extras.scanCache || null;

  let totalPromptChars = 0;
  for (const rec of Object.values(promptSizes)) {
    if (rec && typeof rec.total_prompt_chars === "number") {
      totalPromptChars += rec.total_prompt_chars;
    }
  }

  const ranked = rankBlockInflation(promptSizes);

  const baselineChars = extras.baselineTotalChars;
  const reduction =
    baselineChars != null && baselineChars > 0
      ? Math.max(0, 1 - totalPromptChars / baselineChars)
      : null;

  const payload = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    totals: {
      prompt_chars_sum_steps: totalPromptChars,
      prompt_est_tokens_sum: charsToRoughTokens(totalPromptChars),
      estimated_token_reduction_vs_baseline: reduction,
      baseline_total_chars: baselineChars ?? null,
    },
    scan_cache: scanMeta,
    executor_snippet_economics: execEcon,
    telemetry_counts: telemetryCounts,
    inflation: {
      score_context_ratio: computeInflationScore(promptSizes),
      top_blocks: ranked.top_global,
      blocks_by_step: ranked.per_step,
    },
    correction_loop: extras.correctionLoop || null,
    stable_prefix: extras.stablePrefix || null,
    recovery: extras.recoverySummary || null,
  };

  try {
    fs.writeFileSync(
      path.join(dir, "run-metrics.json"),
      JSON.stringify(payload, null, 2),
      "utf-8",
    );
  } catch (_) {
    /* não bloqueia pipeline */
  }
}

module.exports = {
  writeRunMetricsFromRun,
  charsToRoughTokens,
  rankBlockInflation,
};
