#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createWorkspace } = require("../daemon/lib/workspace-registry");
const {
  createWorkspaceRun,
  addMiniActivity,
  getWorkspaceRun,
} = require("../daemon/lib/workspace-run-registry");
const { startWorkspaceRun } = require("../daemon/lib/workspace-run-orchestrator");
const { persistWorkspaceGit } = require("../daemon/lib/workspace-run-git-api");
const { upsertProjectFromUsage, deriveProjectId } = require("../daemon/lib/project-registry");
const {
  runWorkspaceRunSyncTick,
  syncOneWorkspaceRun,
  startWorkspaceRunSyncLoop,
  stopWorkspaceRunSyncLoop,
} = require("../daemon/lib/workspace-run-sync");
const { readDaemonStatus } = require("../daemon/lib/daemon-status");

function seedGit(workspaceRunId, projectIds) {
  persistWorkspaceGit(workspaceRunId, {
    activityBranch: "feature/phaseh-sync",
    status: "ready",
    preparedAt: new Date().toISOString(),
    projects: projectIds.map((projectId) => ({
      projectId,
      baseBranch: "main",
      activityBranch: "feature/phaseh-sync",
      gitStatus: "ready",
      prepareBranchStatus: "ready",
      lastGitEventAt: new Date().toISOString(),
      commitSha: null,
      prUrl: null,
      errorCode: null,
      errorMessage: null,
    })),
  });
}

async function main() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-phaseh-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "daemon", "queue.json"), JSON.stringify({ jobs: [] }), "utf-8");

  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  const prevSync = process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED;
  const prevInterval = process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED = "1";
  process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS = "80";

  try {
    const projA = path.join(repo, "svc-a");
    const projB = path.join(repo, "svc-b");
    fs.mkdirSync(projA, { recursive: true });
    fs.mkdirSync(projB, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projA, displayName: "A" });
    upsertProjectFromUsage({ projectRoot: projB, displayName: "B" });
    const pidA = deriveProjectId(projA);
    const pidB = deriveProjectId(projB);

    const ws = createWorkspace({ name: "Phase H", projectIds: [pidA, pidB] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Auto sync smoke" });
    const runId = wsr.workspaceRun.workspaceRunId;
    const ma1 = addMiniActivity(runId, { order: 0, title: "Backend", targetProjectId: pidA });
    const id1 = ma1.workspaceRun.miniActivities[0].miniActivityId;
    addMiniActivity(runId, {
      order: 1,
      title: "Frontend",
      targetProjectId: pidB,
      dependsOnMiniActivityIds: [id1],
    });
    seedGit(runId, [pidA, pidB]);

    const child1 = "20260517-140010-phaseh-a";
    const child2 = "20260517-140011-phaseh-b";
    let createCalls = 0;
    let polls = 0;
    const orchOpts = () => ({
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        createCalls += 1;
        return { ok: true, data: { runId: createCalls === 1 ? child1 : child2 } };
      },
      resolveChildStatusFn: (rid) => {
        polls += 1;
        if (rid === child1 && polls >= 2) {
          return { phase: "completed", reason: "execution_completed" };
        }
        return { phase: "running", reason: "in_progress" };
      },
    });

    await startWorkspaceRun(runId, orchOpts());
    assert.strictEqual(createCalls, 1, "start cria só primeiro filho");

    const tick1 = await runWorkspaceRunSyncTick({
      repoRoot: repo,
      advanceFn: async (id, o) => {
        const { advanceWorkspaceRunOrchestration } = require("../daemon/lib/workspace-run-orchestrator");
        return advanceWorkspaceRunOrchestration(id, { ...o, ...orchOpts() });
      },
    });
    assert.strictEqual(tick1.processed, 1);
    assert.strictEqual(createCalls, 2, "sync auto-avança segunda mini");
    assert.strictEqual(getWorkspaceRun(runId).miniActivities[0].status, "completed");

    let resumeCreates = 0;
    await runWorkspaceRunSyncTick({
      repoRoot: repo,
      advanceFn: async (id, o) => {
        const { advanceWorkspaceRunOrchestration } = require("../daemon/lib/workspace-run-orchestrator");
        return advanceWorkspaceRunOrchestration(id, {
          ...o,
          createRunFromTaskFn: async () => {
            resumeCreates += 1;
            throw new Error("não duplicar");
          },
          resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
        });
      },
    });
    assert.strictEqual(resumeCreates, 0, "sync não duplica run filho");

    const waitWsr = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Waiting",
    });
    const waitId = waitWsr.workspaceRun.workspaceRunId;
    addMiniActivity(waitId, { order: 0, title: "W", targetProjectId: pidA });
    seedGit(waitId, [pidA]);
    let waitCreates = 0;
    await startWorkspaceRun(waitId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        waitCreates += 1;
        return { ok: true, data: { runId: "20260517-140020-wait" } };
      },
      resolveChildStatusFn: () => ({ phase: "waiting_user_action", reason: "hitl" }),
    });
    const beforeWait = waitCreates;
    await runWorkspaceRunSyncTick({ repoRoot: repo });
    assert.strictEqual(waitCreates, beforeWait, "waiting não avança");

    const failWsr = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Failed",
    });
    const failId = failWsr.workspaceRun.workspaceRunId;
    addMiniActivity(failId, { order: 0, title: "F", targetProjectId: pidA });
    seedGit(failId, [pidA]);
    await startWorkspaceRun(failId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => ({
        ok: true,
        data: { runId: "20260517-140021-fail" },
      }),
      resolveChildStatusFn: () => ({ phase: "failed", reason: "execution_failed" }),
    });
    assert.strictEqual(getWorkspaceRun(failId).status, "failed");
    const failCreatesBefore = createCalls;
    await syncOneWorkspaceRun(failId, { repoRoot: repo });
    assert.strictEqual(createCalls, failCreatesBefore, "failed não avança");

    let releaseGate = () => {};
    const gate = new Promise((r) => {
      releaseGate = r;
    });
    const slow = syncOneWorkspaceRun(runId, {
      repoRoot: repo,
      advanceFn: async () => {
        await gate;
        return { ok: true, inProgress: true };
      },
    });
    await new Promise((r) => setTimeout(r, 10));
    const blocked = await syncOneWorkspaceRun(runId, { repoRoot: repo });
    assert.strictEqual(blocked.skipped, true);
    releaseGate();
    await slow;

    startWorkspaceRunSyncLoop({ repoRoot: repo });
    await new Promise((r) => setTimeout(r, 200));
    stopWorkspaceRunSyncLoop();
    const status = readDaemonStatus();
    assert.ok(status.workspaceRunSync);
    assert.ok(status.workspaceRunSync.lastTickAt);

    polls = 0;
    createCalls = 0;
    const doneWsr = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Completed aggregate",
    });
    const doneId = doneWsr.workspaceRun.workspaceRunId;
    addMiniActivity(doneId, { order: 0, title: "Only", targetProjectId: pidA });
    seedGit(doneId, [pidA]);
    const onlyChild = "20260517-140030-done";
    await startWorkspaceRun(doneId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        createCalls += 1;
        return { ok: true, data: { runId: onlyChild } };
      },
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });
    polls = 1;
    await runWorkspaceRunSyncTick({
      repoRoot: repo,
      advanceFn: async (id, o) => {
        const { advanceWorkspaceRunOrchestration } = require("../daemon/lib/workspace-run-orchestrator");
        return advanceWorkspaceRunOrchestration(id, {
          ...o,
          createRunFromTaskFn: async () => ({ ok: true, data: { runId: onlyChild } }),
          resolveChildStatusFn: () => ({ phase: "completed", reason: "done" }),
        });
      },
    });
    assert.strictEqual(getWorkspaceRun(doneId).status, "completed");

    console.log("[smoke] workspace-sync-phaseH: OK", { workspaceRunId: runId });
  } finally {
    stopWorkspaceRunSyncLoop();
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    if (prevSync === undefined) delete process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED;
    else process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED = prevSync;
    if (prevInterval === undefined) delete process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS;
    else process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS = prevInterval;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[smoke] workspace-sync-phaseH: FAIL", err);
  process.exit(1);
});
