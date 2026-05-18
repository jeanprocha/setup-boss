"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const { writeRunIndex } = require("../../../core/run-resolver");
const {
  prepareRunGitBranch,
  readRunGitState,
  inspectWorkingTreeForGitPrepare,
  GIT_BRANCH_STATUS,
} = require("./run-git-branch-api");
const { getCurrentBranch } = require("../../../core/git-exec");

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

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

function seedStrategyReadyRun(projectRoot, outputDir, runId, taskTitle) {
  fs.mkdirSync(outputDir, { recursive: true });
  writeRunIndex({
    runId,
    projectRoot,
    outputDir,
    run_type: "test",
  });
  fs.writeFileSync(
    path.join(outputDir, "run-context.json"),
    JSON.stringify(
      {
        run_id: runId,
        phase2: { schema_version: "1.0.0", status: "ready_for_execution" },
        phase3: { schema_version: "1.0.0", status: "strategy_ready" },
        task: { title: taskTitle || "Criar Chat Integração" },
      },
      null,
      2,
    ),
    "utf-8",
  );
  const strategyDir = path.join(outputDir, "strategy");
  fs.mkdirSync(strategyDir, { recursive: true });
  fs.writeFileSync(
    path.join(strategyDir, "strategy-readiness.json"),
    JSON.stringify({ schema_version: "1.0.0", status: "strategy_ready" }, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(strategyDir, "execution-ready-handoff.json"),
    JSON.stringify({ status: "execution_ready_handoff_completed" }, null, 2),
    "utf-8",
  );
}

test("prepareRunGitBranch: happy path sem remote", async () => {
  const projectRoot = tmpRoot("sb-git-br-happy-");
  initGitRepo(projectRoot);
  const runId = "20260516-180000-test-git-branch-happy";
  const outputDir = path.join(projectRoot, "docs", ".IA", "outputs", runId);
  seedStrategyReadyRun(projectRoot, outputDir, runId, "Criar Chat Integração");

  const branch = "setup-boss/20260516-chat-happy-path";
  const r = await prepareRunGitBranch({ runId, activityBranch: branch });
  assert.strictEqual(r.ok, true, r.message);
  assert.strictEqual(r.data?.git?.status, GIT_BRANCH_STATUS.READY);
  assert.strictEqual(r.data?.git?.activityBranch, branch);
  assert.strictEqual(r.data?.git?.pullBeforeCreate, false);
  assert.ok(r.data?.git?.baseCommit);
  assert.ok(r.data?.git?.headCommitAfterCreate);
  assert.strictEqual(getCurrentBranch(projectRoot), branch);

  const disk = readRunGitState(outputDir);
  assert.strictEqual(disk?.status, GIT_BRANCH_STATUS.READY);
  assert.strictEqual(disk?.activityBranch, branch);

  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test("prepareRunGitBranch: geração automática de branch", async () => {
  const projectRoot = tmpRoot("sb-git-br-auto-");
  initGitRepo(projectRoot);
  const runId = "20260516-180001-test-git-branch-auto";
  const outputDir = path.join(projectRoot, "docs", ".IA", "outputs", runId);
  seedStrategyReadyRun(projectRoot, outputDir, runId, "Componente Chat");

  const r = await prepareRunGitBranch({ runId });
  assert.strictEqual(r.ok, true, r.message);
  const name = String(r.data?.git?.activityBranch || "");
  assert.match(name, /^setup-boss\/\d{8}-componente-chat$/);
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test("prepareRunGitBranch: branch já existente com nome explícito reutiliza checkout", async () => {
  const projectRoot = tmpRoot("sb-git-br-exists-");
  initGitRepo(projectRoot);
  const runId = "20260516-180002-test-git-branch-exists";
  const outputDir = path.join(projectRoot, "docs", ".IA", "outputs", runId);
  seedStrategyReadyRun(projectRoot, outputDir, runId);

  const existing = "setup-boss/20260516-ja-existe";
  execFileSync("git", ["branch", existing], { cwd: projectRoot, stdio: "pipe", windowsHide: true });

  const r = await prepareRunGitBranch({ runId, activityBranch: existing });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.idempotent, true);
  assert.strictEqual(readRunGitState(outputDir)?.status, GIT_BRANCH_STATUS.READY);
  assert.strictEqual(readRunGitState(outputDir)?.activityBranch, existing);
  assert.strictEqual(getCurrentBranch(projectRoot), existing);
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test("inspectWorkingTreeForGitPrepare: docs/.IA e .setup-boss não bloqueiam", () => {
  const projectRoot = tmpRoot("sb-git-br-clean-");
  initGitRepo(projectRoot);
  fs.mkdirSync(path.join(projectRoot, ".setup-boss", "inbox"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "docs", ".IA"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "docs", ".IA", "scratch.md"),
    "# sb\n",
    "utf-8",
  );
  const runId = "20260517-test-git-clean-ia";
  const outputDir = path.join(projectRoot, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const inspection = inspectWorkingTreeForGitPrepare(projectRoot, outputDir);
  assert.equal(inspection.blocked, false, JSON.stringify(inspection.blockingEntries));
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test("prepareRunGitBranch: dirty working tree fora do output da corrida", async () => {
  const projectRoot = tmpRoot("sb-git-br-dirty-");
  initGitRepo(projectRoot);
  fs.writeFileSync(path.join(projectRoot, "src-dirty.txt"), "x\n", "utf-8");

  const runId = "20260516-180003-test-git-branch-dirty";
  const outputDir = path.join(projectRoot, "docs", ".IA", "outputs", runId);
  seedStrategyReadyRun(projectRoot, outputDir, runId);

  const r = await prepareRunGitBranch({
    runId,
    activityBranch: "setup-boss/20260516-dirty-test",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "git_dirty_worktree");
  assert.ok(r.data?.dirtyWorktree?.blockingEntries?.length >= 1);
  assert.ok(String(r.message).includes("src-dirty.txt"));
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test("prepareRunGitBranch: pull failure com remote inválido", async () => {
  const projectRoot = tmpRoot("sb-git-br-pull-fail-");
  initGitRepo(projectRoot);
  execFileSync(
    "git",
    ["remote", "add", "origin", "https://invalid.invalid-setup-boss.example/repo.git"],
    { cwd: projectRoot, stdio: "pipe", windowsHide: true },
  );

  const runId = "20260516-180004-test-git-branch-pull";
  const outputDir = path.join(projectRoot, "docs", ".IA", "outputs", runId);
  seedStrategyReadyRun(projectRoot, outputDir, runId);

  const r = await prepareRunGitBranch({
    runId,
    activityBranch: "setup-boss/20260516-pull-fail",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "git_pull_failed");
  assert.strictEqual(readRunGitState(outputDir)?.status, GIT_BRANCH_STATUS.FAILED);
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test("prepareRunGitBranch: idempotente quando já ready", async () => {
  const projectRoot = tmpRoot("sb-git-br-idem-");
  initGitRepo(projectRoot);
  const runId = "20260516-180005-test-git-branch-idem";
  const outputDir = path.join(projectRoot, "docs", ".IA", "outputs", runId);
  seedStrategyReadyRun(projectRoot, outputDir, runId);

  const branch = "setup-boss/20260516-idem";
  const first = await prepareRunGitBranch({ runId, activityBranch: branch });
  assert.strictEqual(first.ok, true);
  const second = await prepareRunGitBranch({ runId, activityBranch: branch });
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.idempotent, true);
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test("prepareRunGitBranch: não é repositório Git", async () => {
  const projectRoot = tmpRoot("sb-git-br-norepo-");
  fs.mkdirSync(projectRoot, { recursive: true });
  const runId = "20260516-180006-test-git-branch-norepo";
  const outputDir = path.join(projectRoot, "docs", ".IA", "outputs", runId);
  seedStrategyReadyRun(projectRoot, outputDir, runId);

  const r = await prepareRunGitBranch({
    runId,
    activityBranch: "setup-boss/20260516-norepo",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "git_not_repository");
  fs.rmSync(projectRoot, { recursive: true, force: true });
});
