const path = require("path");
const { discoverRuns } = require("../lib/runs-discovery");
const { summarizeRun, formatDurationMs } = require("../lib/run-summarize");
const { readJsonSafe } = require("../lib/json-io");
const { aggregateFailureCounts } = require("../lib/failure-diagnostics");
const {
  VALIDATION_RUNTIME_SUMMARY_FILENAME,
} = require("../../execution-plan/validation-targeting/constants");

function ratioPct(hit, miss) {
  const h = Number(hit) || 0;
  const m = Number(miss) || 0;
  const d = h + m;
  if (d <= 0) return null;
  return Math.round((100 * h) / d);
}

function mergeTelemetryCounters(acc, tm) {
  if (!tm || typeof tm !== "object") return;
  for (const [k, v] of Object.entries(tm)) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    acc[k] = (acc[k] || 0) + n;
  }
}

function runStatus({ repoRoot = null } = {}) {
  const entries = discoverRuns({ includeLegacy: true, repoRoot });
  const rows = entries.map((e) => summarizeRun(e.output_dir, e));

  let approved = 0;
  let rejected = 0;
  let blocked = 0;
  let running = 0;
  let unknown = 0;
  let dryRunRuns = 0;

  let durSum = 0;
  let durN = 0;
  let corrSum = 0;
  let costSum = 0;
  let costN = 0;

  const telemMerged = {};

  for (const r of rows) {
    if (String(r.execution_mode || "").toLowerCase() === "dry_run") {
      dryRunRuns += 1;
    }

    const b = r.status_bucket;
    if (b === "approved") approved += 1;
    else if (b === "rejected") rejected += 1;
    else if (b === "blocked") blocked += 1;
    else if (b === "running") running += 1;
    else unknown += 1;

    if (r.duration_ms != null) {
      durSum += r.duration_ms;
      durN += 1;
    }
    corrSum += r.correction_iterations || 0;
    if (r.cost_usd != null) {
      costSum += r.cost_usd;
      costN += 1;
    }

    const rm = readJsonSafe(
      path.join(r.output_dir, "run-metrics.json"),
      1_500_000,
    );
    if (rm && rm.telemetry_counts) {
      mergeTelemetryCounters(telemMerged, rm.telemetry_counts);
    }
  }

  const total = rows.length;
  console.log(`Runs: ${total}`);
  console.log(`Approved: ${approved}`);
  console.log(`Rejected: ${rejected}`);
  console.log(`Blocked: ${blocked}`);
  console.log(`Dry-run mode (metadata): ${dryRunRuns}`);
  if (running) console.log(`Running: ${running}`);
  if (unknown) console.log(`Other/unknown: ${unknown}`);
  console.log("");

  const avgDur = durN ? durSum / durN : null;
  const avgCorr = total ? corrSum / total : null;
  const avgCost = costN ? costSum / costN : null;

  console.log(`Avg duration: ${avgDur != null ? formatDurationMs(avgDur) : "—"}`);
  console.log(
    `Avg corrections: ${avgCorr != null ? avgCorr.toFixed(1) : "—"}`,
  );
  console.log(`Avg cost: ${avgCost != null ? `$${avgCost.toFixed(2)}` : "—"}`);
  console.log("");

  const scanHit = telemMerged["scan.cache.hit"] || 0;
  const scanMiss = telemMerged["scan.cache.miss"] || 0;
  const snHit = telemMerged["snippet.cache.hit"] || 0;
  const snMiss = telemMerged["snippet.cache.miss"] || 0;

  const scanPct = ratioPct(scanHit, scanMiss);
  const snPct = ratioPct(snHit, snMiss);

  console.log("Cache hit ratio:");
  if (scanPct != null) {
    console.log(`- scan cache: ${scanPct}%`);
  } else {
    console.log("- scan cache: — (sem telemetria agregada)");
  }
  if (snPct != null) {
    console.log(`- snippet cache: ${snPct}%`);
  } else {
    console.log("- snippet cache: — (sem telemetria agregada)");
  }

  let valRuns = 0;
  let valPassed = 0;
  let valFailed = 0;
  let valUnresolved = 0;
  let valCacheHits = 0;
  let valCacheMisses = 0;
  let valDurationMs = 0;
  for (const r of rows) {
    const vs = readJsonSafe(
      path.join(r.output_dir, VALIDATION_RUNTIME_SUMMARY_FILENAME),
      262144,
    );
    if (vs && vs.summary && typeof vs.summary === "object") {
      valRuns += 1;
      valPassed += Number(vs.summary.passed) || 0;
      valFailed += Number(vs.summary.failed) || 0;
      valUnresolved += Number(vs.summary.unresolved) || 0;
      valCacheHits += Number(vs.summary.cache_hits) || 0;
      valCacheMisses += Number(vs.summary.cache_misses) || 0;
      valDurationMs += Number(vs.summary.total_duration_ms) || 0;
    }
  }
  if (valRuns > 0) {
    console.log("");
    console.log(`Validation execution (Fase 4.10): ${valRuns} run(s) com ${VALIDATION_RUNTIME_SUMMARY_FILENAME}`);
    console.log(`  Σ passed: ${valPassed}  Σ failed: ${valFailed}  Σ unresolved: ${valUnresolved}`);
    console.log(`  Σ cache_hits: ${valCacheHits}  Σ cache_misses: ${valCacheMisses}`);
    console.log(`  Σ duration: ${formatDurationMs(valDurationMs)}`);
  }

  const fc = aggregateFailureCounts(rows);
  const top = Array.from(fc.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  console.log("");
  console.log("Most common failures:");
  if (top.length === 0) {
    console.log("- (nenhum sinal categorizado)");
  } else {
    for (const [k, n] of top) {
      console.log(`- ${k} (${n})`);
    }
  }
}

module.exports = { runStatus };
