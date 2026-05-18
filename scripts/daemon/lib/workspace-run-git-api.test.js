"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const { createWorkspace } = require("./workspace-registry");
const { createWorkspaceRun, addMiniActivity, getWorkspaceRun } = require("./workspace-run-registry");
const { upsertProjectFromUsage, deriveProjectId } = require("./project-registry");
const { suggestWorkspaceActivityBranchName } = require("../../../core/suggest-workspace-activity-branch");
const { getCurrentBranch } = require("../../../core/git-exec");
const { startWorkspaceRun } = require("./workspace-run-orchestrator");
const {
  prepareWorkspaceRunGit,
  getWorkspaceRunGitStatus,
  retryPrepareWorkspaceGitProject,
} = require("./workspace-run-git-api");

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

async function withIsolatedDataDir(fn) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-git-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "daemon", "queue.json"), JSON.stringify({ jobs: [] }), "utf-8");
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  try {
    await fn({ repo, dataDir });
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

test("suggestWorkspaceActivityBranchName é determinístico", () => {
  const id = "wsrun_20260516-120000-auth-refactor";
  const a = suggestWorkspaceActivityBranchName("Auth Refactor", id);
  const b = suggestWorkspaceActivityBranchName("Auth Refactor", id);
  assert.strictEqual(a, b);
  assert.match(a, /^feature\/workspace-run-/);
});

test("prepareWorkspaceRunGit: múltiplos projetos e idempotência", async () => {
  await withIsolatedDataDir(async () => {
    const projA = fs.mkdtempSync(path.join(os.tmpdir(), "sb-proj-a-"));
    const projB = fs.mkdtempSync(path.join(os.tmpdir(), "sb-proj-b-"));
    initGitRepo(projA);
    initGitRepo(projB);
    upsertProjectFromUsage({ projectRoot: projA, displayName: "A" });
    upsertProjectFromUsage({ projectRoot: projB, displayName: "B" });
    const pidA = deriveProjectId(projA);
    const pidB = deriveProjectId(projB);

    const ws = createWorkspace({ name: "Stack", projectIds: [pidA, pidB] });
    const wsr = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Auth Refactor",
    });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "API", targetProjectId: pidA });
    addMiniActivity(runId, { order: 1, title: "UI", targetProjectId: pidB });

    const first = await prepareWorkspaceRunGit(runId);
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.git.status, "ready");
    const branch = first.git.activityBranch;
    assert.strictEqual(getCurrentBranch(projA), branch);
    assert.strictEqual(getCurrentBranch(projB), branch);

    const second = await prepareWorkspaceRunGit(runId);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.idempotent, true);
  });
});

test("prepareWorkspaceRunGit: projeto skipped", async () => {
  await withIsolatedDataDir(async () => {
    const projA = fs.mkdtempSync(path.join(os.tmpdir(), "sb-skip-a-"));
    const projB = fs.mkdtempSync(path.join(os.tmpdir(), "sb-skip-b-"));
    initGitRepo(projA);
    initGitRepo(projB);
    upsertProjectFromUsage({ projectRoot: projA, displayName: "A" });
    upsertProjectFromUsage({ projectRoot: projB, displayName: "B" });
    const pidA = deriveProjectId(projA);
    const pidB = deriveProjectId(projB);

    const ws = createWorkspace({ name: "Stack", projectIds: [pidA, pidB] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Skip test" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "A", targetProjectId: pidA });
    addMiniActivity(runId, { order: 1, title: "B", targetProjectId: pidB });

    const r = await prepareWorkspaceRunGit(runId, { skipProjectIds: [pidB] });
    assert.strictEqual(r.ok, true);
    const skipped = r.git.projects.find((p) => p.projectId === pidB);
    assert.strictEqual(skipped.gitStatus, "skipped");
    const ready = r.git.projects.find((p) => p.projectId === pidA);
    assert.strictEqual(ready.gitStatus, "ready");
  });
});

test("prepareWorkspaceRunGit: falha parcial", async () => {
  await withIsolatedDataDir(async () => {
    const projA = fs.mkdtempSync(path.join(os.tmpdir(), "sb-partial-a-"));
    const projB = fs.mkdtempSync(path.join(os.tmpdir(), "sb-partial-b-"));
    initGitRepo(projA);
    fs.mkdirSync(projB, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projA, displayName: "A" });
    upsertProjectFromUsage({ projectRoot: projB, displayName: "B" });
    const pidA = deriveProjectId(projA);
    const pidB = deriveProjectId(projB);

    const ws = createWorkspace({ name: "Stack", projectIds: [pidA, pidB] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Partial" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "A", targetProjectId: pidA });
    addMiniActivity(runId, { order: 1, title: "B", targetProjectId: pidB });

    const r = await prepareWorkspaceRunGit(runId);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.git.status, "partial_failure");
    const st = await getWorkspaceRunGitStatus(runId);
    assert.strictEqual(st.ready, false);
  });
});

test("retryPrepareWorkspaceGitProject recupera projeto falhado", async () => {
  await withIsolatedDataDir(async () => {
    const projA = fs.mkdtempSync(path.join(os.tmpdir(), "sb-retry-a-"));
    const projB = fs.mkdtempSync(path.join(os.tmpdir(), "sb-retry-b-"));
    initGitRepo(projA);
    fs.mkdirSync(projB, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projA, displayName: "A" });
    upsertProjectFromUsage({ projectRoot: projB, displayName: "B" });
    const pidA = deriveProjectId(projA);
    const pidB = deriveProjectId(projB);

    const ws = createWorkspace({ name: "Stack", projectIds: [pidA, pidB] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Retry" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "A", targetProjectId: pidA });
    addMiniActivity(runId, { order: 1, title: "B", targetProjectId: pidB });

    await prepareWorkspaceRunGit(runId);
    initGitRepo(projB);

    const retried = await retryPrepareWorkspaceGitProject(runId, pidB);
    assert.strictEqual(retried.ok, true);
    const row = getWorkspaceRun(runId);
    assert.strictEqual(row.git.status, "ready");
  });
});

test("start bloqueado sem git ready", async () => {
  await withIsolatedDataDir(async ({ repo }) => {
    const projDir = path.join(repo, "app-a");
    fs.mkdirSync(projDir, { recursive: true });
    initGitRepo(projDir);
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App A" });
    const projectId = deriveProjectId(projDir);

    const ws = createWorkspace({ name: "Stack", projectIds: [projectId] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Gate" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "Mini", targetProjectId: projectId });

    const blocked = await startWorkspaceRun(runId, { repoRoot: repo });
    assert.strictEqual(blocked.code, "workspace_git_not_ready");
  });
});
