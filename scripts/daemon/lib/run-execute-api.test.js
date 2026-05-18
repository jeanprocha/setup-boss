"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const {
  validateExecuteReadiness,
  deriveExecuteAvailability,
  triggerRunExecution,
  collectOrchestrationBootstrap,
  mapExecutionState,
} = require("./run-execute-api");
const { writeRunIndex } = require("../../../core/run-resolver");
const { buildApprovalState } = require("../../runtime/clarification/approval");
const { GIT_BRANCH_READY } = require("../../../core/validate-git-execute-gate");
const { loadQueueUnsafe } = require("./queue-store");

function initGitRepo(root) {
  execFileSync("git", ["init"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["config", "user.email", "test@setup-boss.local"], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  execFileSync("git", ["config", "user.name", "Setup Boss Test"], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  fs.writeFileSync(path.join(root, "README.md"), "# t\n", "utf-8");
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "pipe", windowsHide: true });
}

function checkoutBranch(root, branchName) {
  execFileSync("git", ["checkout", "-b", branchName], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
}

/** Evita gate em master/main nos testes que esperam execução livre. */
function ensureNonProtectedBranch(projectRoot) {
  checkoutBranch(projectRoot, "setup-boss/test-exec-safe");
}

function seedReadyRun(outputDir, runId, projectRoot, gitPatch) {
  fs.mkdirSync(outputDir, { recursive: true });
  writeRunIndex({
    runId,
    projectRoot,
    outputDir,
    run_type: "test",
  });
  const ctx = {
    run_id: runId,
    phase2: { schema_version: "1.0.0", status: "ready_for_execution" },
    phase3: { schema_version: "1.0.0", status: "ready_for_execution" },
  };
  if (gitPatch) {
    ctx.git = gitPatch;
  }
  fs.writeFileSync(path.join(outputDir, "run-context.json"), JSON.stringify(ctx, null, 2), "utf-8");
  const planRef = "task-plan-refined.md";
  fs.writeFileSync(path.join(outputDir, planRef), "# Plano\n\nOK\n", "utf-8");
  const approval = buildApprovalState({
    decision: "approved",
    planRef,
    planSha256: "abc",
  });
  fs.writeFileSync(
    path.join(outputDir, "approval-state.json"),
    JSON.stringify(approval, null, 2),
    "utf-8",
  );
  const strategyDir = path.join(outputDir, "strategy");
  fs.mkdirSync(strategyDir, { recursive: true });
  fs.writeFileSync(
    path.join(strategyDir, "strategy-readiness.json"),
    JSON.stringify({ schema_version: "1.0.0", status: "ready" }, null, 2),
    "utf-8",
  );
}

function seedGitReadyRun(projectRoot, outputDir, runId, activityBranch) {
  initGitRepo(projectRoot);
  checkoutBranch(projectRoot, activityBranch);
  seedReadyRun(outputDir, runId, projectRoot, {
    enabled: true,
    status: GIT_BRANCH_READY,
    activityBranch,
  });
}

test("mapExecutionState mapeia orchestration + lifecycle", () => {
  assert.strictEqual(
    mapExecutionState("execution_starting", null),
    "execution_starting",
  );
  assert.strictEqual(
    mapExecutionState("queued", "execution_running"),
    "execution_running",
  );
  assert.strictEqual(
    mapExecutionState("completed", "execution_completed"),
    "execution_completed",
  );
});

test("validateExecuteReadiness bloqueia sem approval", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exec-guard-"));
  const runId = "20260515-120000-test-exec-guard";
  const out = path.join(dir, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(out, { recursive: true });
  writeRunIndex({ runId, projectRoot: dir, outputDir: out });
  fs.writeFileSync(
    path.join(out, "run-context.json"),
    JSON.stringify({ phase2: { status: "ready_for_execution" } }, null, 2),
    "utf-8",
  );
  const r = validateExecuteReadiness({
    runId,
    outputDir: out,
    jobs: [],
    daemonSnapshot: { running: true },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "clarification_not_approved");
});

test("validateExecuteReadiness aceita run pronta", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exec-ready-"));
  initGitRepo(dir);
  ensureNonProtectedBranch(dir);
  const runId = "20260515-120001-test-exec-ready";
  const out = path.join(dir, "docs", ".IA", "outputs", runId);
  seedReadyRun(out, runId, dir);
  const r = validateExecuteReadiness({
    runId,
    outputDir: out,
    jobs: [],
    daemonSnapshot: { running: true },
  });
  assert.strictEqual(r.ok, true);
});

test("validateExecuteReadiness aceita phase3 inicializado com readiness strategy_ready", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exec-p3init-"));
  initGitRepo(dir);
  ensureNonProtectedBranch(dir);
  const runId = "20260515-120003-test-exec-p3init";
  const out = path.join(dir, "docs", ".IA", "outputs", runId);
  seedReadyRun(out, runId, dir);
  const ctxPath = path.join(out, "run-context.json");
  const ctx = JSON.parse(fs.readFileSync(ctxPath, "utf-8"));
  ctx.phase3 = {
    schema_version: "1.0.0",
    status: "strategy_runtime_initialized",
    readiness: { status: "strategy_ready", artifact: "strategy/strategy-readiness.json" },
  };
  fs.writeFileSync(ctxPath, JSON.stringify(ctx, null, 2), "utf-8");
  const r = validateExecuteReadiness({
    runId,
    outputDir: out,
    jobs: [],
    daemonSnapshot: { running: true },
  });
  assert.strictEqual(r.ok, true, r.message);
});

test("validateExecuteReadiness bloqueia em main sem git_branch_ready", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exec-git-main-"));
  initGitRepo(dir);
  const runId = "20260516-190000-test-exec-git-main";
  const out = path.join(dir, "docs", ".IA", "outputs", runId);
  seedReadyRun(out, runId, dir);
  const r = validateExecuteReadiness({
    runId,
    outputDir: out,
    jobs: [],
    daemonSnapshot: { running: true },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "git_branch_required");
  assert.match(r.message, /Prepare a branch/i);
});

test("validateExecuteReadiness bloqueia em main com ready mas branch diferente", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exec-git-mismatch-"));
  initGitRepo(dir);
  const runId = "20260516-190001-test-exec-git-mismatch";
  const out = path.join(dir, "docs", ".IA", "outputs", runId);
  seedReadyRun(out, runId, dir, {
    enabled: true,
    status: GIT_BRANCH_READY,
    activityBranch: "setup-boss/20260516-other",
  });
  const r = validateExecuteReadiness({
    runId,
    outputDir: out,
    jobs: [],
    daemonSnapshot: { running: true },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "git_branch_mismatch");
});

test("validateExecuteReadiness permite quando currentBranch === activityBranch ready", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exec-git-ok-"));
  const activity = "setup-boss/20260516-exec-ok";
  const runId = "20260516-190002-test-exec-git-ok";
  const out = path.join(dir, "docs", ".IA", "outputs", runId);
  seedGitReadyRun(dir, out, runId, activity);
  const r = validateExecuteReadiness({
    runId,
    outputDir: out,
    jobs: [],
    daemonSnapshot: { running: true },
  });
  assert.strictEqual(r.ok, true, r.message);
});

test("validateExecuteReadiness bloqueia repo inválido", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exec-git-norepo-"));
  const runId = "20260516-190003-test-exec-git-norepo";
  const out = path.join(dir, "docs", ".IA", "outputs", runId);
  seedReadyRun(out, runId, dir);
  const r = validateExecuteReadiness({
    runId,
    outputDir: out,
    jobs: [],
    daemonSnapshot: { running: true },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "git_not_repository");
});

test("deriveExecuteAvailability retorna reason git_branch_required em main", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exec-derive-git-"));
  initGitRepo(dir);
  const runId = "20260516-190004-test-exec-derive";
  const out = path.join(dir, "docs", ".IA", "outputs", runId);
  seedReadyRun(out, runId, dir);
  const availability = deriveExecuteAvailability({
    runId,
    outputDir: out,
    jobs: [],
    daemonSnapshot: { running: true },
  });
  assert.strictEqual(availability.canExecute, false);
  assert.strictEqual(availability.reason, "git_branch_required");
});

test("triggerRunExecution não enfileira job quando gate Git bloqueia", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exec-git-noqueue-"));
  initGitRepo(repoRoot);
  const queueDir = path.join(repoRoot, ".setup-boss", "daemon");
  fs.mkdirSync(queueDir, { recursive: true });
  fs.writeFileSync(
    path.join(queueDir, "queue.json"),
    JSON.stringify({ schema_version: "1.0.0", jobs: [] }, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(queueDir, "status.json"),
    JSON.stringify({ running: true, pid: process.pid }, null, 2),
    "utf-8",
  );

  const runId = "20260516-190005-test-exec-git-noqueue";
  const out = path.join(repoRoot, "docs", ".IA", "outputs", runId);
  seedReadyRun(out, runId, repoRoot);

  const dataDir = path.join(repoRoot, ".setup-boss");
  const prevCwd = process.cwd();
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  process.chdir(repoRoot);
  try {
    const res = await triggerRunExecution({
      repoRoot,
      runId,
      daemonSnapshot: { running: true },
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, "git_branch_required");
    const jobs = loadQueueUnsafe().jobs;
    assert.strictEqual(jobs.length, 0);
  } finally {
    process.chdir(prevCwd);
    if (prevData == null) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
  }
});

test("triggerRunExecution enfileira job run_execute", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exec-trigger-"));
  initGitRepo(repoRoot);
  ensureNonProtectedBranch(repoRoot);
  const queueDir = path.join(repoRoot, ".setup-boss", "daemon");
  fs.mkdirSync(queueDir, { recursive: true });
  fs.writeFileSync(
    path.join(queueDir, "queue.json"),
    JSON.stringify({ schema_version: "1.0.0", jobs: [] }, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(queueDir, "status.json"),
    JSON.stringify({ running: true, pid: process.pid }, null, 2),
    "utf-8",
  );

  const runId = "20260515-120002-test-exec-trigger";
  const out = path.join(repoRoot, "docs", ".IA", "outputs", runId);
  seedReadyRun(out, runId, repoRoot);

  const dataDir = path.join(repoRoot, ".setup-boss");
  const prevCwd = process.cwd();
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  process.chdir(repoRoot);
  try {
    const res = await triggerRunExecution({
      repoRoot,
      runId,
      daemonSnapshot: { running: true },
    });
    assert.strictEqual(res.ok, true);
    assert.ok(res.data?.jobId);
    assert.strictEqual(res.data?.executionState, "execution_starting");
    const boot = collectOrchestrationBootstrap(runId, out);
    assert.strictEqual(boot.orchestrationState, "execution_starting");
  } finally {
    process.chdir(prevCwd);
    if (prevData == null) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
  }
});
