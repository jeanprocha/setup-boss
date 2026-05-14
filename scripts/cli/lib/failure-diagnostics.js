function slugUpper(s) {
  return String(s || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 48);
}

function collectFailureSignals(_outputDir, bundle) {
  const runLog = bundle.runLog;
  const review = bundle.review;
  const architectVal = bundle.architectVal;

  const keys = [];

  if (architectVal && architectVal.invalid_task === true) {
    keys.push("ARCHITECT_INVALID");
    if (Array.isArray(architectVal.violations) && architectVal.violations[0]) {
      const v = slugUpper(architectVal.violations[0].slice(0, 40));
      if (v) keys.push(v);
    }
  }

  if (runLog && Array.isArray(runLog.errors)) {
    for (const err of runLog.errors) {
      if (!err || typeof err !== "object") continue;
      const gate = err.meta && err.meta.gate;
      if (gate) keys.push(slugUpper(gate));
      const step = err.step ? `STEP_${slugUpper(err.step)}` : "";
      if (step && step !== "STEP_") keys.push(step);
      const msg = String(err.message || "");
      if (/SEARCH_NOT_FOUND|search not found|not found/i.test(msg)) {
        keys.push("SEARCH_NOT_FOUND");
      }
      if (/ARCHITECT/i.test(msg) && /invalid/i.test(msg)) {
        keys.push("ARCHITECT_INVALID");
      }
    }
  }

  if (review && review.status === "blocked" && Array.isArray(review.blocking_issues)) {
    for (const line of review.blocking_issues.slice(0, 3)) {
      const k = slugUpper(String(line || "").slice(0, 48));
      if (k && k.length > 3) keys.push(k);
    }
  }

  return keys;
}

function aggregateFailureCounts(runs) {
  const counts = new Map();
  for (const r of runs) {
    const bundle = {
      runLog: r.runLog,
      review: r.review,
      architectVal: r.architectVal,
    };
    const keys = collectFailureSignals(r.output_dir, bundle);
    const seen = new Set();
    for (const k of keys) {
      if (!k || seen.has(k)) continue;
      seen.add(k);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return counts;
}

module.exports = { collectFailureSignals, aggregateFailureCounts, slugUpper };
