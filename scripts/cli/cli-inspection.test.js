#!/usr/bin/env node
/**
 * Testes leves da CLI de inspeção (sem framework).
 * Executar: node scripts/cli/cli-inspection.test.js
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const os = require("os");

const { discoverRuns } = require("./lib/runs-discovery");
const { summarizeRun } = require("./lib/run-summarize");
const { deriveOperationalStatus } = require("./lib/operational-status");
const { resolveInspectSelection } = require("./commands/inspect");
const { readJsonSafe } = require("./lib/json-io");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "setup-boss-cli-"));
}

function writeJson(dir, name, obj) {
  fs.writeFileSync(
    path.join(dir, name),
    JSON.stringify(obj, null, 2),
    "utf-8",
  );
}

function baseRunLog(overrides = {}) {
  const now = new Date();
  return {
    run_id: "rid",
    project: "../p",
    task: "tasks/foo-bar.md",
    status: "partial",
    started_at: new Date(now.getTime() - 120_000).toISOString(),
    finished_at: now.toISOString(),
    steps: [],
    correction_iterations: 2,
    generated_files: [],
    errors: [],
    warnings: [],
    limits: {},
    cost_latency: { total_duration_ms: 0, estimated_total_tokens: 0, estimated_cost_usd: 0 },
    cache: {},
    ...overrides,
  };
}

(() => {
  const tmp = mkTmp();

  const out1 = path.join(tmp, "out1");
  fs.mkdirSync(out1, { recursive: true });
  writeJson(out1, "run-log.json", baseRunLog({ correction_iterations: 1, status: "partial" }));
  writeJson(out1, "review-output.json", { status: "approved", requires_correction: false });
  writeJson(out1, "metadata.json", {
    projectRoot: tmp,
    taskPath: "tasks/foo-bar.md",
    llm_usage_total: { input_tokens: 10, output_tokens: 20, estimated_cost_usd: 0.12 },
  });
  writeJson(out1, "executor-changes.json", [{ path: "a.ts" }, { path: "b.ts" }]);
  writeJson(out1, "run-metrics.json", {
    totals: { prompt_chars_sum_steps: 100, prompt_est_tokens_sum: 25 },
    telemetry_counts: { "cache.hit": 3, "cache.miss": 1, "snippet.cache.hit": 8, "snippet.cache.miss": 2, "scan.cache.hit": 1 },
  });

  const runsDir = path.join(tmp, ".setup-boss", "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  writeJson(runsDir, "20260101-120000-foo.json", {
    run_id: "20260101-120000-foo",
    project_root: tmp,
    output_dir: out1,
    created_at: "2026-01-01T12:00:00.000Z",
  });

  const entries = discoverRuns({ includeLegacy: false, repoRoot: tmp });
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].run_id, "20260101-120000-foo");

  const sum = summarizeRun(out1, entries[0]);
  assert.strictEqual(sum.status, "APPROVED");
  assert.strictEqual(sum.status_bucket, "approved");
  assert.strictEqual(sum.changed_files, 2);
  assert.strictEqual(sum.cost_usd, 0.12);

  const sel = resolveInspectSelection(entries, "latest");
  assert.ok(sel.entry);
  assert.strictEqual(sel.entry.run_id, "20260101-120000-foo");

  const selIdx = resolveInspectSelection(entries, "0");
  assert.ok(selIdx.entry);

  const no = resolveInspectSelection(entries, "999");
  assert.ok(no.error);
})();

(() => {
  const tmp = mkTmp();
  const out = path.join(tmp, "inv");
  fs.mkdirSync(out, { recursive: true });
  writeJson(out, "run-log.json", baseRunLog({ status: "partial" }));
  writeJson(out, "architect-validation.json", { invalid_task: true, violations: ["bad scope"] });
  writeJson(out, "metadata.json", { projectRoot: tmp });

  const op = deriveOperationalStatus(out, {
    runLog: readJsonSafe(path.join(out, "run-log.json"), 1e6),
    review: null,
    executorResult: null,
    architectVal: readJsonSafe(path.join(out, "architect-validation.json"), 1e6),
  });
  assert.strictEqual(op.label, "INVALID_TASK");
  assert.strictEqual(op.bucket, "blocked");
})();

(() => {
  const tmp = mkTmp();
  const out = path.join(tmp, "rej");
  fs.mkdirSync(out, { recursive: true });
  writeJson(out, "run-log.json", baseRunLog({}));
  writeJson(out, "review-output.json", { status: "rejected", requires_correction: true });
  writeJson(out, "metadata.json", { projectRoot: tmp });

  const sum = summarizeRun(out, { run_id: "r", output_dir: out, project_root: tmp });
  assert.strictEqual(sum.status, "REJECTED");
})();

(() => {
  const tmp = mkTmp();
  const legacyOut = path.join(tmp, "outputs", "legacy-run");
  fs.mkdirSync(legacyOut, { recursive: true });
  writeJson(legacyOut, "run-log.json", baseRunLog({ task: "x.md" }));

  const all = discoverRuns({ includeLegacy: true, repoRoot: tmp });
  const leg = all.find((e) => e.run_id === "legacy-run");
  assert.ok(leg);
  const sum = summarizeRun(legacyOut, leg);
  assert.ok(sum.task_title);
})();

(() => {
  const tmp = mkTmp();
  const bad = path.join(tmp, "bad.json");
  fs.writeFileSync(bad, "{ not json", "utf-8");
  assert.strictEqual(readJsonSafe(bad, 1000, null), null);
})();

console.log("cli-inspection.test.js: OK");
