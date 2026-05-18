#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const { createWorkspace, getWorkspace } = require("../daemon/lib/workspace-registry");
const {
  createWorkspaceRun,
  addMiniActivity,
  getWorkspaceRun,
  loadWorkspaceRunsUnsafe,
  updateWorkspaceRun,
} = require("../daemon/lib/workspace-run-registry");
const {
  startWorkspaceRun,
  resumeWorkspaceRun,
  advanceWorkspaceRunOrchestration,
  retryMiniActivity,
  skipMiniActivity,
} = require("../daemon/lib/workspace-run-orchestrator");
const { prepareWorkspaceRunGit, getWorkspaceRunGitStatus } = require("../daemon/lib/workspace-run-git-api");
const { upsertProjectFromUsage, deriveProjectId } = require("../daemon/lib/project-registry");
const { writeRunIndex, resolveRunIndexPath } = require("../../core/run-resolver");
const { suggestWorkspaceActivityBranchName } = require("../../core/suggest-workspace-activity-branch");
const { getCurrentBranch } = require("../../core/git-exec");
const { reconcileWorkspaceRunsOnBoot, reconcileWorkspaceRun } = require("../daemon/lib/workspace-run-reconcile");
const { tryAcquireWorkspaceRunLock, releaseWorkspaceRunLock } = require("../daemon/lib/workspace-run-lock");
const { createRunFromTask } = require("../daemon/lib/run-intake-api");
const { REQUIRED_SEED_FILES } = require("../../core/validate-project-knowledge-base");
const { REQUIRED_INDEX_FILES } = require("../../core/validate-ia-governance-structure");

const INDEX_MD = "Version: 1.0\n# .IA\n";

function initGitRepo(root) {
  execFileSync("git", ["init"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["config", "user.email", "smoke@setup-boss.local"], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  execFileSync("git", ["config", "user.name", "Setup Boss Smoke"], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  fs.writeFileSync(path.join(root, "README.md"), "# smoke\n", "utf-8");
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "pipe", windowsHide: true });
}

function gitTrack(root, relPath, content = "# test\n") {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  execFileSync("git", ["add", "--", relPath], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "phaseg-seed"], { cwd: root, stdio: "pipe", windowsHide: true });
}

function seedCompliantGitProject(root) {
  initGitRepo(root);
  for (const rel of REQUIRED_SEED_FILES) {
    gitTrack(root, rel, rel === "docs/.IA/index.md" ? INDEX_MD : undefined);
  }
  for (const rel of REQUIRED_INDEX_FILES) {
    gitTrack(root, rel);
  }
}

function seedChildRun(projectRoot, runId, workspaceRunId, miniActivityId) {
  const outputDir = path.join(projectRoot, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  writeRunIndex({
    runId,
    projectRoot,
    outputDir,
    workspaceRunId,
    miniActivityId,
  });
  return outputDir;
}

async function main() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-phaseg-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "daemon", "queue.json"), JSON.stringify({ jobs: [] }), "utf-8");

  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;

  try {
    const projA = path.join(repo, "service-a");
    const projB = path.join(repo, "service-b");
    fs.mkdirSync(projA, { recursive: true });
    fs.mkdirSync(projB, { recursive: true });
    initGitRepo(projA);
    initGitRepo(projB);
    upsertProjectFromUsage({ projectRoot: projA, displayName: "Service A" });
    upsertProjectFromUsage({ projectRoot: projB, displayName: "Service B" });
    const pidA = deriveProjectId(projA);
    const pidB = deriveProjectId(projB);

    const ws = createWorkspace({ name: "Phase G Stack", projectIds: [pidA, pidB] });
    assert.ok(getWorkspace(ws.workspace.workspaceId));

    const wsr = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Auth Refactor Multi-Project E2E",
    });
    const workspaceRunId = wsr.workspaceRun.workspaceRunId;

    const ma1 = addMiniActivity(workspaceRunId, {
      order: 0,
      title: "Backend API smoke",
      targetProjectId: pidA,
    });
    assert.strictEqual(ma1.ok, true);
    const id1 = ma1.workspaceRun.miniActivities.find((m) => m.order === 0).miniActivityId;

    const ma2 = addMiniActivity(workspaceRunId, {
      order: 1,
      title: "Frontend UI smoke",
      targetProjectId: pidB,
      dependsOnMiniActivityIds: [id1],
    });
    assert.strictEqual(ma2.ok, true);

    const reloaded = loadWorkspaceRunsUnsafe();
    assert.ok(
      reloaded.workspaceRuns.some((r) => r.workspaceRunId === workspaceRunId),
      "persistência workspace run",
    );

    const prep = await prepareWorkspaceRunGit(workspaceRunId);
    assert.strictEqual(prep.ok, true, prep.message);
    const branch = prep.git.activityBranch;
    assert.ok(branch);
    assert.strictEqual(getCurrentBranch(projA), branch);
    assert.strictEqual(getCurrentBranch(projB), branch);
    assert.strictEqual(
      suggestWorkspaceActivityBranchName("Auth Refactor Multi-Project E2E", workspaceRunId),
      branch,
    );

    const gitStatus = getWorkspaceRunGitStatus(workspaceRunId);
    assert.strictEqual(gitStatus.ready, true);

    const child1 = "20260517-120010-phaseg-a";
    const child2 = "20260517-120011-phaseg-b";
    let createCalls = 0;
    const createFn = async ({ projectId }) => {
      createCalls += 1;
      const runId = createCalls === 1 ? child1 : child2;
      const projectRoot = projectId === pidA ? projA : projB;
      seedChildRun(projectRoot, runId, workspaceRunId, createCalls === 1 ? id1 : "ma2");
      return { ok: true, data: { runId } };
    };

    let polls = 0;
    const resolveFn = (rid) => {
      polls += 1;
      if (rid === child1 && polls >= 2) {
        return { phase: "completed", reason: "execution_completed" };
      }
      return { phase: "running", reason: "in_progress" };
    };

    const started = await startWorkspaceRun(workspaceRunId, {
      repoRoot: repo,
      createRunFromTaskFn: createFn,
      resolveChildStatusFn: resolveFn,
    });
    assert.strictEqual(started.ok, true);
    assert.strictEqual(createCalls, 1);

    const idx1 = JSON.parse(fs.readFileSync(resolveRunIndexPath(child1), "utf-8"));
    assert.strictEqual(idx1.workspace_run_id, workspaceRunId);
    assert.strictEqual(idx1.mini_activity_id, id1);

    const advanced = await advanceWorkspaceRunOrchestration(workspaceRunId, {
      repoRoot: repo,
      createRunFromTaskFn: createFn,
      resolveChildStatusFn: resolveFn,
    });
    assert.strictEqual(advanced.ok, true);
    assert.strictEqual(createCalls, 2);

    const rowMid = getWorkspaceRun(workspaceRunId);
    assert.strictEqual(rowMid.miniActivities[0].status, "completed");
    assert.strictEqual(rowMid.miniActivities[1].runId, child2);
    assert.ok(rowMid.childRunIds.includes(child1));
    assert.ok(rowMid.childRunIds.includes(child2));

    const resumed = await resumeWorkspaceRun(workspaceRunId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        throw new Error("resume não deve duplicar run filho");
      },
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });
    assert.strictEqual(resumed.ok, true);
    assert.strictEqual(createCalls, 2);

    const waitingRun = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Waiting user action scenario",
    });
    const waitId = waitingRun.workspaceRun.workspaceRunId;
    addMiniActivity(waitId, { order: 0, title: "Wait mini", targetProjectId: pidA });
    await prepareWorkspaceRunGit(waitId);
    const waitChild = "20260517-120020-phaseg-wait";
    const waitStart = await startWorkspaceRun(waitId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        seedChildRun(projA, waitChild, waitId, "ma_w");
        return { ok: true, data: { runId: waitChild } };
      },
      resolveChildStatusFn: () => ({ phase: "waiting_user_action", reason: "awaiting_approval" }),
    });
    assert.strictEqual(waitStart.stopped, "waiting_user_action");
    assert.strictEqual(getWorkspaceRun(waitId).status, "waiting_user_action");

    const failedRun = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Failed scenario",
    });
    const failId = failedRun.workspaceRun.workspaceRunId;
    addMiniActivity(failId, { order: 0, title: "Fail mini", targetProjectId: pidA });
    await prepareWorkspaceRunGit(failId);
    const failChild = "20260517-120021-phaseg-fail";
    const failStart = await startWorkspaceRun(failId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        seedChildRun(projA, failChild, failId, "ma_f");
        return { ok: true, data: { runId: failChild } };
      },
      resolveChildStatusFn: () => ({ phase: "failed", reason: "execution_failed" }),
    });
    assert.strictEqual(failStart.stopped, "child_failed");
    assert.strictEqual(getWorkspaceRun(failId).status, "failed");

    const skipRun = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Skip retry scenario",
    });
    const skipId = skipRun.workspaceRun.workspaceRunId;
    const sa = addMiniActivity(skipId, { order: 0, title: "Skip A", targetProjectId: pidA });
    const sb = addMiniActivity(skipId, { order: 1, title: "Skip B", targetProjectId: pidB });
    const idSkipA = sa.workspaceRun.miniActivities[0].miniActivityId;
    const idSkipB = sb.workspaceRun.miniActivities.find((m) => m.title === "Skip B").miniActivityId;
    await prepareWorkspaceRunGit(skipId);

    let skipCreates = 0;
    const skipped = await skipMiniActivity(skipId, idSkipA, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        skipCreates += 1;
        return { ok: true, data: { runId: "20260517-120030-phaseg-skip-b" } };
      },
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });
    assert.strictEqual(skipped.ok, true);
    assert.strictEqual(skipCreates, 1);
    assert.strictEqual(
      getWorkspaceRun(skipId).miniActivities.find((m) => m.miniActivityId === idSkipA).status,
      "skipped",
    );

    const rowB = getWorkspaceRun(skipId).miniActivities.find((m) => m.miniActivityId === idSkipB);
    updateWorkspaceRun(skipId, {
      status: "failed",
      miniActivities: getWorkspaceRun(skipId).miniActivities.map((m) =>
        m.miniActivityId === idSkipB
          ? { ...m, status: "failed", runId: rowB.runId }
          : m,
      ),
    });

    const retried = await retryMiniActivity(skipId, idSkipB, {
      repoRoot: repo,
      createRunFromTaskFn: async () => ({ ok: true, data: { runId: "20260517-120031-phaseg-retry-b" } }),
      resolveChildStatusFn: () => ({ phase: "completed", reason: "done" }),
    });
    assert.strictEqual(retried.ok, true);

    const done = await advanceWorkspaceRunOrchestration(skipId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        throw new Error("não deve criar run extra");
      },
      resolveChildStatusFn: (rid) =>
        rid === "20260517-120031-phaseg-retry-b"
          ? { phase: "completed", reason: "done" }
          : { phase: "running", reason: "in_progress" },
    });
    assert.ok(done.completed || getWorkspaceRun(skipId).status === "completed");

    const lockHeld = tryAcquireWorkspaceRunLock(workspaceRunId, { pid: 999999, label: "foreign" });
    if (lockHeld.ok) releaseWorkspaceRunLock(workspaceRunId, 999999);

    const stuckRun = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Recovery stuck mini",
    });
    const stuckId = stuckRun.workspaceRun.workspaceRunId;
    addMiniActivity(stuckId, {
      order: 0,
      title: "Stuck running without run",
      targetProjectId: pidA,
      status: "running",
    });
    updateWorkspaceRun(stuckId, {
      status: "running",
      miniActivities: getWorkspaceRun(stuckId).miniActivities.map((m) => ({
        ...m,
        status: "running",
        runId: null,
      })),
    });

    const boot = reconcileWorkspaceRunsOnBoot({ cap: 50 });
    assert.ok(boot.scanned >= 1);
    const stuckAfter = getWorkspaceRun(stuckId);
    assert.strictEqual(stuckAfter.miniActivities[0].status, "ready");

    const recoveryRun = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Daemon restart recovery",
    });
    const recoveryId = recoveryRun.workspaceRun.workspaceRunId;
    addMiniActivity(recoveryId, { order: 0, title: "Recovery mini", targetProjectId: pidA });
    await prepareWorkspaceRunGit(recoveryId);
    const recoveryChild = "20260517-120040-phaseg-recovery";
    await startWorkspaceRun(recoveryId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        seedChildRun(projA, recoveryChild, recoveryId, "ma_r");
        return { ok: true, data: { runId: recoveryChild } };
      },
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });

    delete require.cache[require.resolve("../daemon/lib/workspace-run-registry")];
    const { getWorkspaceRun: getReloaded } = require("../daemon/lib/workspace-run-registry");
    const persisted = getReloaded(recoveryId);
    assert.strictEqual(persisted.miniActivities[0].runId, recoveryChild);

    reconcileWorkspaceRun(recoveryId);
    let recoveryCreates = 0;
    const afterRestart = await resumeWorkspaceRun(recoveryId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        recoveryCreates += 1;
        throw new Error("não duplicar");
      },
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });
    assert.strictEqual(afterRestart.ok, true);
    assert.strictEqual(recoveryCreates, 0);

    const plainProject = path.join(repo, "legacy-app");
    fs.mkdirSync(plainProject, { recursive: true });
    seedCompliantGitProject(plainProject);
    upsertProjectFromUsage({ projectRoot: plainProject, displayName: "Legacy" });
    const legacyPid = deriveProjectId(plainProject);
    const legacy = await createRunFromTask({
      repoRoot: repo,
      projectId: legacyPid,
      task: "Smoke run legado Project → Run sem workspace",
      metadata: { source: "phaseg_smoke", skipLlm: true },
    });
    assert.strictEqual(legacy.ok, true, legacy.error?.message);
    assert.ok(legacy.data.runId);
    const legacyIdx = JSON.parse(
      fs.readFileSync(resolveRunIndexPath(legacy.data.runId), "utf-8"),
    );
    assert.ok(!legacyIdx.workspace_run_id, "run legado sem workspace_run_id");

    console.log("[smoke] workspace-e2e-phaseG: OK", {
      workspaceRunId,
      activityBranch: branch,
      bootReconciled: boot.reconciled,
    });
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[smoke] workspace-e2e-phaseG: FAIL", err);
  process.exit(1);
});
