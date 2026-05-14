/**
 * Agrega métricas de corridas anteriores (índice local .setup-boss/runs).
 */

const fs = require("fs");
const path = require("path");
const { discoverRuns } = require("../../cli/lib/runs-discovery");
const { readJsonSafe } = require("../../cli/lib/json-io");

function normalizeRoot(p) {
  try {
    return path.resolve(String(p || ""));
  } catch (_) {
    return "";
  }
}

function readProblemHistoryTail(projectRootAbs, maxLines = 60) {
  const fp = path.join(projectRootAbs, ".IA", "09-problem-history.jsonl");
  if (!fs.existsSync(fp)) return { entries: 0, recent_errors: 0 };

  let raw = "";
  try {
    raw = fs.readFileSync(fp, "utf-8");
  } catch (_) {
    return { entries: 0, recent_errors: 0 };
  }

  const lines = raw.split(/\r?\n/).filter(Boolean).slice(-maxLines);
  let recent_errors = 0;

  for (const line of lines) {
    try {
      const o = JSON.parse(line);
      const st = String(o.status || "").toLowerCase();
      const sev = String(o.severity || "").toLowerCase();
      if (st === "error" || sev === "high" || sev === "critical") recent_errors++;
    } catch (_) {
      /* skip */
    }
  }

  return { entries: lines.length, recent_errors };
}

function aggregateRunsForProject({
  setupBossRepoRoot,
  projectRootAbs,
  maxRuns = 22,
}) {
  const proj = normalizeRoot(projectRootAbs);
  const entries = discoverRuns({ includeLegacy: true, repoRoot: setupBossRepoRoot });

  const scoped = [];
  for (const e of entries) {
    const er = normalizeRoot(e.project_root || "");
    if (!proj || !er) continue;
    if (er === proj) scoped.push(e);
  }

  const pool = scoped.length ? scoped : entries;
  const slice = pool.slice(0, maxRuns);

  const nums = {
    samples: 0,
    prompt_chars: [],
    est_tokens: [],
    files_changed: [],
    correction_iterations: [],
    inflation_ratio: [],
    cost_usd: [],
    scan_cache_hits: 0,
    scan_cache_misses: 0,
  };

  for (const e of slice) {
    const outDir = e.output_dir;
    if (!outDir || !fs.existsSync(outDir)) continue;

    const rm = readJsonSafe(path.join(outDir, "run-metrics.json"), 2_000_000, null);
    const rl = readJsonSafe(path.join(outDir, "run-log.json"), 2_000_000, null);
    const ch = readJsonSafe(path.join(outDir, "executor-changes.json"), 2_000_000, []);
    const meta = readJsonSafe(path.join(outDir, "metadata.json"), 2_000_000, null);

    nums.samples++;

    if (rm && rm.totals && typeof rm.totals.prompt_chars_sum_steps === "number") {
      nums.prompt_chars.push(rm.totals.prompt_chars_sum_steps);
    }
    if (rm && rm.totals && typeof rm.totals.prompt_est_tokens_sum === "number") {
      nums.est_tokens.push(rm.totals.prompt_est_tokens_sum);
    }
    if (
      rm &&
      rm.inflation &&
      typeof rm.inflation.score_context_ratio === "number"
    ) {
      nums.inflation_ratio.push(rm.inflation.score_context_ratio);
    }

    const fc = Array.isArray(ch) ? ch.length : null;
    if (fc != null) nums.files_changed.push(fc);

    const ci =
      rl && typeof rl.correction_iterations === "number"
        ? rl.correction_iterations
        : null;
    if (ci != null) nums.correction_iterations.push(ci);

    const cu =
      meta &&
      meta.llm_usage_total &&
      typeof meta.llm_usage_total.estimated_cost_usd === "number"
        ? meta.llm_usage_total.estimated_cost_usd
        : null;
    if (cu != null) nums.cost_usd.push(cu);

    const tc = rm && rm.telemetry_counts ? rm.telemetry_counts : {};
    const hit = Number(tc["scan.cache.hit"] || 0);
    const miss = Number(tc["scan.cache.miss"] || 0);
    nums.scan_cache_hits += hit;
    nums.scan_cache_misses += miss;
  }

  const avg = (arr) =>
    Array.isArray(arr) && arr.length
      ? arr.reduce((a, b) => a + b, 0) / arr.length
      : null;

  const pct = (arr, q) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const ix = Math.min(s.length - 1, Math.floor(q * (s.length - 1)));
    return s[ix];
  };

  return {
    scoped_project_hits: scoped.length,
    looked_up_runs: slice.length,
    aggregates: {
      avg_prompt_chars: avg(nums.prompt_chars),
      median_prompt_chars: pct(nums.prompt_chars, 0.5),
      avg_est_tokens: avg(nums.est_tokens),
      avg_files_changed: avg(nums.files_changed),
      avg_correction_iterations: avg(nums.correction_iterations),
      avg_inflation_ratio: avg(nums.inflation_ratio),
      avg_cost_usd: avg(nums.cost_usd),
      samples_used: nums.samples,
      scan_cache_hits: nums.scan_cache_hits,
      scan_cache_misses: nums.scan_cache_misses,
    },
    problem_history: readProblemHistoryTail(projectRootAbs),
  };
}

module.exports = {
  aggregateRunsForProject,
  readProblemHistoryTail,
};
