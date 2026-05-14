#!/usr/bin/env node
/**
 * Suite E2E / estabilização Fase 2.8 (sem LLM por defeito).
 *
 * Variáveis:
 *   SETUP_BOSS_CLI_ROOT — repo setup-boss (default: cwd ou ascendência até encontrar package.json com bin setup-boss)
 *   SETUP_BOSS_E2E_FORCE_CLI — executar subprocess contra CLI mesmo quando SKIP externo
 *
 * Executar: node scripts/tests/e2e/e2e-runner.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const REPO_ROOT = resolveRepoRoot();
const REPORT_PATH = path.join(REPO_ROOT, ".setup-boss", "reports", "e2e-phase28-last.json");

function resolveRepoRoot() {
  const env = process.env.SETUP_BOSS_CLI_ROOT;
  if (env && String(env).trim()) return path.resolve(String(env).trim());
  let dir = path.resolve(process.cwd());
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        const p = JSON.parse(fs.readFileSync(pkg, "utf-8"));
        if (p.name === "setup-boss") return dir;
      } catch (_) {
        /* continuar */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, "..", "..", "..", "..");
}

function ensureReportsDir() {
  const d = path.dirname(REPORT_PATH);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function mkTmp(prefix = "sb-e2e-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(dir, name, obj) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 2), "utf-8");
}

function spawnCli(args, envPatch = {}) {
  const cli = path.join(REPO_ROOT, "scripts", "cli", "index.js");
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, SETUP_BOSS_CLI_ROOT: REPO_ROOT, ...envPatch },
    cwd: REPO_ROOT,
  });
}

const scenarios = [];

function scenario(name, fn) {
  scenarios.push({ name, fn });
}

/* ---------- Cenários determinísticos ---------- */

scenario("validate-run-artifacts + manifest íntegro (fixture)", () => {
  const tmp = mkTmp();
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(proj, { recursive: true });
  const out = path.join(tmp, "out");
  fs.mkdirSync(out, { recursive: true });

  const rel = "sample.txt";
  fs.writeFileSync(path.join(proj, rel), "hello world\n", "utf-8");

  const applied = [
    {
      operation: "patch",
      path: rel,
      search: "world",
      replace: "moon",
      reason: "e2e",
    },
  ];
  writeJson(out, "executor-changes.json", applied);

  const { buildPatchManifest, writePatchManifestToOutput } = require("../../runtime/replay/patch-manifest");
  const man = buildPatchManifest({
    outputDir: out,
    projectRoot: proj,
    run_id: "e2e-rid",
    appliedChanges: applied,
  });
  writePatchManifestToOutput(out, man);

  writeJson(out, "metadata.json", {
    taskArg: "tasks/task-1.md",
    projectArg: "fixture",
    projectRoot: proj,
    execution: {
      mode: "dry_run",
      pending_apply: true,
      lifecycle_state: "AWAITING_APPLY",
    },
  });
  writeJson(out, "run-log.json", { status: "success", task: "task-1.md" });
  writeJson(out, "review-output.json", { status: "approved" });
  writeJson(out, "run-context.json", {
    generated_files: [{ path: rel, reason: "e2e" }],
    baseline_revision_notes: "",
    hints_from_architect: [],
    hints_from_scan: [],
    hints_from_operator_task: [],
  });

  const { validateRunArtifacts } = require("../../runtime/validation/run-artifacts-validator");
  const { validateLifecycleConsistency } = require("../../runtime/validation/lifecycle-consistency");

  const v = validateRunArtifacts(out, { strictProjectRoot: true });
  assert.ok(v.ok, v.errors.join("; "));
  const lc = validateLifecycleConsistency(out);
  assert.ok(lc.ok, lc.issues.map((i) => i.message).join("; "));
});

scenario("lifecycle: manifest stale após mutação de executor-changes", () => {
  const tmp = mkTmp();
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(proj, { recursive: true });
  const out = path.join(tmp, "out");
  fs.mkdirSync(out, { recursive: true });
  const rel = "a.txt";
  fs.writeFileSync(path.join(proj, rel), "x\n", "utf-8");
  const applied = [{ operation: "patch", path: rel, search: "x", replace: "y", reason: "t" }];
  writeJson(out, "executor-changes.json", applied);
  const { buildPatchManifest, writePatchManifestToOutput } = require("../../runtime/replay/patch-manifest");
  const man = buildPatchManifest({
    outputDir: out,
    projectRoot: proj,
    run_id: "e2e-stale",
    appliedChanges: applied,
  });
  writePatchManifestToOutput(out, man);

  writeJson(out, "executor-changes.json", [
    { operation: "patch", path: rel, search: "x", replace: "z", reason: "mutado" },
  ]);

  const { validateLifecycleConsistency } = require("../../runtime/validation/lifecycle-consistency");
  const lc = validateLifecycleConsistency(out);
  assert.ok(!lc.ok);
  assert.ok(lc.issues.some((i) => i.code === "STALE_MANIFEST"));
});

scenario("governance STRICT: dry-run obrigatório (runtime core signal)", () => {
  const { evaluateRuntimeGovernance } = require("../../runtime/governance/policy-engine");
  const preflight = {
    risk: { tier: "LOW" },
    complexity: { tier: "LOW" },
    scope: { estimated_files_max: 3, change_types: [] },
    warnings: [],
    prompts: { totals: { est_prompt_chars_sum: 100 } },
    cost: { estimated_cost_usd_mid: 0.01, pricing_available: true },
  };

  const blocked = evaluateRuntimeGovernance({
    projectRootAbs: REPO_ROOT,
    preflightReport: preflight,
    taskContent: "Alterar scripts/runtime/orchestration.js para logging.",
    dryRun: false,
    flowOptions: { policyProfile: "STRICT", forcePolicyBypass: false, disableGovernance: false },
    envMaxCorrections: 3,
  });

  assert.strictEqual(blocked.block_pipeline, true);
  assert.ok(blocked.decisions.some((d) => d.code === "MANDATORY_DRY_RUN"));

  const okDry = evaluateRuntimeGovernance({
    projectRootAbs: REPO_ROOT,
    preflightReport: preflight,
    taskContent: "Alterar scripts/runtime/orchestration.js para logging.",
    dryRun: true,
    flowOptions: { policyProfile: "STRICT", forcePolicyBypass: false, disableGovernance: false },
    envMaxCorrections: 3,
  });

  assert.strictEqual(okDry.block_pipeline, false);
});

scenario("recovery: classificação timeout / search_not_found / retry budget", () => {
  const { classifyProviderError } = require("../../runtime/recovery/failure-classifier");
  const { classifyExecutorBlockedJson } = require("../../runtime/recovery/failure-classifier");
  const { createBudgetSession } = require("../../runtime/recovery/retry-budget");

  const to = classifyProviderError({ message: "timeout", code: "ETIMEDOUT" });
  assert.strictEqual(to.retryable, true);

  const blocked = {
    status: "blocked",
    blocked_reason: "trecho search não encontrado no arquivo real.",
    evidence: [],
    changes: [],
  };
  const fc = classifyExecutorBlockedJson(blocked);
  assert.strictEqual(fc.retryable_micro, true);

  const b = createBudgetSession({ executor_micro_retry: 1, provider_retry: 0, correction_retry: 0 });
  assert.strictEqual(b.consume("executor_micro_retry"), true);
  assert.strictEqual(b.consume("executor_micro_retry"), false);
});

scenario("CLI resiliente: JSON corrupto em artefactos — summarize não explode", () => {
  const out = mkTmp();
  fs.writeFileSync(path.join(out, "run-log.json"), "{ not json", "utf-8");
  fs.writeFileSync(path.join(out, "review-output.json"), "[broken", "utf-8");
  fs.writeFileSync(path.join(out, "metadata.json"), "null", "utf-8");

  const { loadArtifactsForStatus } = require("../../cli/lib/operational-status");
  const { summarizeRun } = require("../../cli/lib/run-summarize");
  const loaded = loadArtifactsForStatus(out);
  assert.ok(loaded.op);
  const sum = summarizeRun(out, { run_id: "fake", output_dir: out, project_root: "", created_at: "" });
  assert.ok(sum.status);
});

scenario("resume-engine: próxima fase após executor falho (artefactos mínimos)", () => {
  const tmp = mkTmp();
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(proj, { recursive: true });
  const out = path.join(tmp, "out");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "scan-output.md"), "# scan\n", "utf-8");
  writeJson(out, "metadata.json", {
    taskArg: "tasks/x.md",
    projectArg: "proj",
    projectRoot: proj,
    scan: { skipped: false },
    execution: { lifecycle_state: "EXECUTING", mode: "apply" },
  });
  writeJson(out, "run-log.json", { status: "partial", task: "x.md" });
  writeJson(out, "executor-result.json", { status: "error" });
  writeJson(out, "run-context.json", {
    generated_files: [],
    hints_from_architect: [],
    hints_from_scan: [],
    hints_from_operator_task: [],
    baseline_revision_notes: "",
  });

  const { assessResume } = require("../../runtime/replay/resume-engine");
  const a = assessResume(out);
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.next_phase, "executor");
});

scenario("validate-run-artifacts CLI (subprocess)", () => {
  const tmp = mkTmp();
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(proj, { recursive: true });
  const out = path.join(tmp, "out");
  fs.mkdirSync(out, { recursive: true });
  const rel = "f.txt";
  fs.writeFileSync(path.join(proj, rel), "a\n", "utf-8");
  const applied = [{ operation: "patch", path: rel, search: "a", replace: "b", reason: "c" }];
  writeJson(out, "executor-changes.json", applied);
  const { buildPatchManifest, writePatchManifestToOutput } = require("../../runtime/replay/patch-manifest");
  writePatchManifestToOutput(
    out,
    buildPatchManifest({
      outputDir: out,
      projectRoot: proj,
      run_id: "cli-rid",
      appliedChanges: applied,
    }),
  );
  writeJson(out, "metadata.json", {
    taskArg: "t.md",
    projectArg: "p",
    projectRoot: proj,
    execution: { mode: "dry_run", pending_apply: true, lifecycle_state: "AWAITING_APPLY" },
  });
  writeJson(out, "run-log.json", { status: "success" });
  writeJson(out, "review-output.json", { status: "approved" });
  writeJson(out, "run-context.json", {
    generated_files: [{ path: rel }],
    hints_from_architect: [],
    hints_from_scan: [],
    hints_from_operator_task: [],
    baseline_revision_notes: "",
  });

  const script = path.join(REPO_ROOT, "scripts", "validate-run-artifacts.js");
  const reportPath = path.join(tmp, "validation-report.json");
  const r = spawnSync(
    process.execPath,
    [script, out, `--report-json=${reportPath}`],
    {
      encoding: "utf8",
      cwd: REPO_ROOT,
      env: process.env,
    },
  );
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.ok(fs.existsSync(reportPath), "report JSON não foi escrito");
  const payload = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  assert.strictEqual(payload.ok, true);
});

scenario("setup-boss doctor + list (subprocess)", () => {
  const d = spawnCli(["doctor"]);
  assert.strictEqual(d.status, 0, d.stderr || d.stdout);

  const l = spawnCli(["list", "--limit=5"]);
  assert.strictEqual(l.status, 0, l.stderr || l.stdout);
});

scenario("continuity.test.js (node --test)", () => {
  const continuity = path.join(REPO_ROOT, "scripts", "runtime", "replay", "continuity.test.js");
  const r = spawnSync(process.execPath, ["--test", continuity], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env: process.env,
  });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
});

scenario("governance.test.js (node --test)", () => {
  const p = path.join(REPO_ROOT, "scripts", "runtime", "governance", "governance.test.js");
  if (!fs.existsSync(p)) return;
  const r = spawnSync(process.execPath, ["--test", p], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env: process.env,
  });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
});

scenario("recovery.test.js (node)", () => {
  const p = path.join(REPO_ROOT, "scripts", "runtime", "recovery", "recovery.test.js");
  const r = spawnSync(process.execPath, [p], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env: process.env,
  });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
});

async function main() {
  const edgeCases = [];
  const corrections = [];
  const results = [];

  console.log(`E2E Phase 2.8 — repo: ${REPO_ROOT}`);
  console.log("—".repeat(56));

  for (const s of scenarios) {
    const row = { name: s.name, ok: false, error: null };
    try {
      await s.fn();
      row.ok = true;
      console.log(`✅ ${s.name}`);
    } catch (e) {
      row.error = String(e && e.message ? e.message : e);
      console.error(`❌ ${s.name}`);
      console.error(`   ${row.error}`);
      edgeCases.push({ scenario: s.name, error: row.error });
    }
    results.push(row);
  }

  ensureReportsDir();
  const report = {
    generated_at: new Date().toISOString(),
    repo_root: REPO_ROOT,
    ok: results.every((r) => r.ok),
    scenarios: results,
    edge_cases_observed: edgeCases,
    corrections_applied_summary: corrections,
    golden_paths_documentation: [
      "Cenário A (task→approved→apply): requer OPENAI_API_KEY e projeto real — ver docs/operator-guide.md",
      "Cenário B (dry-run→inspect→apply-later): fluxo em docs/dry-run.md e docs/replay-and-resume.md",
      "Cenário C (executor failure→recovery): políticas em docs/recovery-system.md",
      "Cenário D (resume após interrupção): docs/replay-and-resume.md § Resume",
      "Cenário E (STRICT+governance): coberto nesta suite (evaluateRuntimeGovernance) + docs/governance.md",
    ],
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log("\nRelatório:", REPORT_PATH);

  if (!report.ok) process.exit(1);
  console.log("\n✅ E2E Phase 2.8 concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
