#!/usr/bin/env node
/**
 * Testes leves do preflight (sem framework).
 * Executar: node scripts/runtime/preflight/preflight.test.js
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { analyzePreflight } = require("./analyzer");
const { writePreflightArtifacts } = require("./artifacts");
const { writePreflightAccuracy } = require("./accuracy");
const {
  needsConfirmation,
  shouldSkipConfirmation,
} = require("./interactive");

const SETUP_ROOT = path.resolve(__dirname, "..", "..", "..");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-preflight-"));
}

(() => {
  const proj = mkTmp();
  fs.mkdirSync(path.join(proj, "src"), { recursive: true });
  fs.writeFileSync(path.join(proj, "package.json"), "{}");
  fs.writeFileSync(path.join(proj, "src", "app.tsx"), "// ui\n".repeat(50));

  const small = analyzePreflight({
    taskPath: "tasks/small.md",
    taskContent: "Corrigir typo no README apenas.",
    projectRootAbs: proj,
    setupBossRepoRoot: SETUP_ROOT,
    scanUsesCache: true,
  });

  assert.strictEqual(small.complexity.tier, "LOW");
  assert.ok(["LOW", "MEDIUM"].includes(small.risk.tier));

  const heavy = analyzePreflight({
    taskPath: "tasks/heavy.md",
    taskContent: `
Refactor orchestration pipeline executor runtime across React frontend and NestJS backend API.
Prisma migration auth multi-tenant OAuth integration webhook database schema.
scripts/runtime/orchestration.js executor.js review.js
`.repeat(14),
    projectRootAbs: proj,
    setupBossRepoRoot: SETUP_ROOT,
    scanUsesCache: false,
  });

  assert.ok(["HIGH", "EXTREME"].includes(heavy.complexity.tier));
  assert.ok(["HIGH", "CRITICAL", "MEDIUM"].includes(heavy.risk.tier));
  assert.ok(heavy.warnings.length >= 2);

  const out = path.join(proj, "sim-out");
  fs.mkdirSync(out, { recursive: true });
  writePreflightArtifacts(out, heavy);
  assert.ok(fs.existsSync(path.join(out, "preflight-analysis.json")));
  assert.ok(fs.existsSync(path.join(out, "preflight-summary.md")));

  fs.writeFileSync(
    path.join(out, "run-metrics.json"),
    JSON.stringify({
      totals: {
        prompt_chars_sum_steps: heavy.prompts.totals.est_prompt_chars_sum,
        prompt_est_tokens_sum: heavy.prompts.totals.est_tokens_sum,
      },
    }),
  );
  fs.writeFileSync(
    path.join(out, "metadata.json"),
    JSON.stringify({
      llm_usage_total: {
        estimated_cost_usd:
          heavy.cost.estimated_cost_usd_mid != null
            ? heavy.cost.estimated_cost_usd_mid * 1.1
            : null,
      },
    }),
  );
  fs.writeFileSync(
    path.join(out, "executor-changes.json"),
    JSON.stringify([{ path: "a.ts" }, { path: "b.ts" }]),
  );
  fs.writeFileSync(
    path.join(out, "run-log.json"),
    JSON.stringify({ correction_iterations: 1 }),
  );

  writePreflightAccuracy(out);
  assert.ok(fs.existsSync(path.join(out, "preflight-accuracy.json")));

  assert.strictEqual(needsConfirmation(small), false);
  assert.strictEqual(needsConfirmation(heavy), true);
  assert.strictEqual(
    shouldSkipConfirmation({ skipPreflightConfirm: true }),
    true,
  );
})();

console.log("preflight.test.js: OK");
