"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createWorkspace } = require("./workspace-registry");
const {
  createWorkspaceRun,
  addMiniActivity,
  getWorkspaceRun,
  updateWorkspaceRun,
} = require("./workspace-run-registry");
const { startWorkspaceRun } = require("./workspace-run-orchestrator");
const { persistWorkspaceGit } = require("./workspace-run-git-api");
const { upsertProjectFromUsage, deriveProjectId } = require("./project-registry");
const {
  runWorkspaceRunSyncTick,
  syncOneWorkspaceRun,
  startWorkspaceRunSyncLoop,
  stopWorkspaceRunSyncLoop,
  sortActiveRunsForSync,
  workspaceRunSyncCap,
  resetWorkspaceRunSyncBackoff,
  resetWorkspaceRunSyncMetricsForTest,
} = require("./workspace-run-sync");
const { subscribeWorkspaceRunSseListener } = require("./workspace-run-sse");

function seedWorkspaceGitReady(workspaceRunId, projectIds) {
  persistWorkspaceGit(workspaceRunId, {
    activityBranch: "feature/ws-sync-test",
    status: "ready",
    preparedAt: new Date().toISOString(),
    projects: projectIds.map((projectId) => ({
      projectId,
      baseBranch: "main",
      activityBranch: "feature/ws-sync-test",
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

async function withIsolated(fn) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-sync-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "daemon", "queue.json"), JSON.stringify({ jobs: [] }), "utf-8");
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  const prevSync = process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED;
  const prevCap = process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP;
  const prevIdle = process.env.SETUP_BOSS_WORKSPACE_SYNC_IDLE_MAX_INTERVAL_MS;
  const prevInterval = process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED = "1";
  try {
    await fn({ repo, dataDir });
  } finally {
    stopWorkspaceRunSyncLoop();
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    if (prevSync === undefined) delete process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED;
    else process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED = prevSync;
    if (prevCap === undefined) delete process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP;
    else process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP = prevCap;
    if (prevIdle === undefined) delete process.env.SETUP_BOSS_WORKSPACE_SYNC_IDLE_MAX_INTERVAL_MS;
    else process.env.SETUP_BOSS_WORKSPACE_SYNC_IDLE_MAX_INTERVAL_MS = prevIdle;
    if (prevInterval === undefined) delete process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS;
    else process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS = prevInterval;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

test("sync tick avança mini quando filho completed", async () => {
  await withIsolated(async ({ repo }) => {
    const projA = path.join(repo, "app-a");
    const projB = path.join(repo, "app-b");
    fs.mkdirSync(projA, { recursive: true });
    fs.mkdirSync(projB, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projA, displayName: "A" });
    upsertProjectFromUsage({ projectRoot: projB, displayName: "B" });
    const pidA = deriveProjectId(projA);
    const pidB = deriveProjectId(projB);

    const ws = createWorkspace({ name: "Stack", projectIds: [pidA, pidB] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Sync test" });
    const runId = wsr.workspaceRun.workspaceRunId;
    const ma1 = addMiniActivity(runId, { order: 0, title: "API", targetProjectId: pidA });
    const id1 = ma1.workspaceRun.miniActivities[0].miniActivityId;
    addMiniActivity(runId, {
      order: 1,
      title: "Front",
      targetProjectId: pidB,
      dependsOnMiniActivityIds: [id1],
    });
    seedWorkspaceGitReady(runId, [pidA, pidB]);

    const child1 = "20260517-130010-sync-child-1";
    const child2 = "20260517-130011-sync-child-2";
    let createCalls = 0;
    let polls = 0;

    const createFn = async () => {
      createCalls += 1;
      return { ok: true, data: { runId: createCalls === 1 ? child1 : child2 } };
    };
    const resolveFn = (rid) => {
      polls += 1;
      if (rid === child1 && polls >= 2) {
        return { phase: "completed", reason: "execution_completed" };
      }
      return { phase: "running", reason: "in_progress" };
    };

    await startWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: createFn,
      resolveChildStatusFn: resolveFn,
    });
    assert.strictEqual(createCalls, 1);

    const tick = await runWorkspaceRunSyncTick({
      repoRoot: repo,
      advanceFn: async (id, o) => {
        const { advanceWorkspaceRunOrchestration } = require("./workspace-run-orchestrator");
        return advanceWorkspaceRunOrchestration(id, {
          ...o,
          createRunFromTaskFn: createFn,
          resolveChildStatusFn: resolveFn,
        });
      },
    });

    assert.strictEqual(tick.processed, 1);
    assert.strictEqual(createCalls, 2);
    assert.strictEqual(getWorkspaceRun(runId).miniActivities[0].status, "completed");
    assert.strictEqual(getWorkspaceRun(runId).miniActivities[1].runId, child2);
  });
});

test("sync tick emite workspace_run.advanced via SSE", async () => {
  await withIsolated(async ({ repo }) => {
    const projA = path.join(repo, "app-sse");
    fs.mkdirSync(projA, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projA, displayName: "A" });
    const pidA = deriveProjectId(projA);
    const ws = createWorkspace({ name: "SSE", projectIds: [pidA] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "SSE sync" });
    const runId = wsr.workspaceRun.workspaceRunId;
    const ma = addMiniActivity(runId, { order: 0, title: "Only", targetProjectId: pidA });
    const miniId = ma.workspaceRun.miniActivities[0].miniActivityId;
    seedWorkspaceGitReady(runId, [pidA]);

    const seen = [];
    const unsub = subscribeWorkspaceRunSseListener((p) => seen.push(p.eventType));

    await startWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => ({ ok: true, data: { runId: "child_sse_sync" } }),
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });

    await syncOneWorkspaceRun(runId, {
      repoRoot: repo,
      advanceFn: async () => ({
        ok: true,
        childRunId: "child_sse_sync",
        startedMiniActivityId: miniId,
      }),
    });

    unsub();
    assert.ok(seen.includes("workspace_run.advanced"));
    assert.ok(seen.includes("workspace_run.updated"));
  });
});

test("sync não avança em waiting_user_action", async () => {
  await withIsolated(async ({ repo }) => {
    const proj = path.join(repo, "app");
    fs.mkdirSync(proj, { recursive: true });
    upsertProjectFromUsage({ projectRoot: proj, displayName: "App" });
    const pid = deriveProjectId(proj);
    const ws = createWorkspace({ name: "W", projectIds: [pid] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Wait" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "Mini", targetProjectId: pid });
    seedWorkspaceGitReady(runId, [pid]);

    let createCalls = 0;
    await startWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        createCalls += 1;
        return { ok: true, data: { runId: "20260517-130020-wait" } };
      },
      resolveChildStatusFn: () => ({ phase: "waiting_user_action", reason: "hitl" }),
    });
    assert.strictEqual(getWorkspaceRun(runId).status, "waiting_user_action");

    const before = createCalls;
    await runWorkspaceRunSyncTick({
      repoRoot: repo,
      advanceFn: async (id, o) => {
        const { advanceWorkspaceRunOrchestration } = require("./workspace-run-orchestrator");
        return advanceWorkspaceRunOrchestration(id, {
          ...o,
          createRunFromTaskFn: async () => {
            createCalls += 1;
            throw new Error("não deve criar");
          },
          resolveChildStatusFn: () => ({ phase: "waiting_user_action", reason: "hitl" }),
        });
      },
    });
    assert.strictEqual(createCalls, before);
  });
});

test("in-flight evita sync concorrente no mesmo workspaceRunId", async () => {
  await withIsolated(async ({ repo }) => {
    const proj = path.join(repo, "app");
    fs.mkdirSync(proj, { recursive: true });
    upsertProjectFromUsage({ projectRoot: proj, displayName: "App" });
    const pid = deriveProjectId(proj);
    const ws = createWorkspace({ name: "W", projectIds: [pid] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Inflight" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "Mini", targetProjectId: pid });
    seedWorkspaceGitReady(runId, [pid]);
    const { updateWorkspaceRun } = require("./workspace-run-registry");
    updateWorkspaceRun(runId, { status: "running" });

    let release = () => {};
    const gate = new Promise((r) => {
      release = r;
    });
    const slow = syncOneWorkspaceRun(runId, {
      repoRoot: repo,
      advanceFn: async () => {
        await gate;
        return { ok: true, inProgress: true };
      },
    });
    await new Promise((r) => setTimeout(r, 15));
    const blocked = await syncOneWorkspaceRun(runId, { repoRoot: repo });
    release();
    await slow;
    assert.strictEqual(blocked.skipped, true);
    assert.strictEqual(blocked.reason, "in_flight");
  });
});

test("sync loop inicia e para", async () => {
  await withIsolated(async ({ repo }) => {
    process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS = "50";
    const handle = startWorkspaceRunSyncLoop({ repoRoot: repo });
    assert.ok(handle);
    await new Promise((r) => setTimeout(r, 120));
    stopWorkspaceRunSyncLoop();
  });
});

test("cap limita WorkspaceRuns processados por tick", async () => {
  await withIsolated(async ({ repo }) => {
    process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP = "2";
    resetWorkspaceRunSyncMetricsForTest();

    const proj = path.join(repo, "cap-app");
    fs.mkdirSync(proj, { recursive: true });
    upsertProjectFromUsage({ projectRoot: proj, displayName: "Cap" });
    const pid = deriveProjectId(proj);
    const ws = createWorkspace({ name: "Cap", projectIds: [pid] });

    const ids = [];
    for (let i = 0; i < 4; i++) {
      const wsr = createWorkspaceRun({
        workspaceId: ws.workspace.workspaceId,
        title: `Run ${i}`,
      });
      const id = wsr.workspaceRun.workspaceRunId;
      addMiniActivity(id, { order: 0, title: "M", targetProjectId: pid });
      seedWorkspaceGitReady(id, [pid]);
      updateWorkspaceRun(id, { status: "running" });
      ids.push(id);
    }

    let syncCalls = 0;
    const tick = await runWorkspaceRunSyncTick({
      repoRoot: repo,
      advanceFn: async (runId) => {
        syncCalls += 1;
        return { ok: true, inProgress: true, workspaceRunId: runId };
      },
    });

    assert.strictEqual(tick.processedLastTick, 2);
    assert.strictEqual(tick.skippedByCapLastTick, 2);
    assert.strictEqual(tick.cap, 2);
    assert.strictEqual(syncCalls, 2);
  });
});

test("backoff sobe sem runs ativos e reseta com resetWorkspaceRunSyncBackoff", async () => {
  await withIsolated(async ({ repo }) => {
    process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS = "1000";
    process.env.SETUP_BOSS_WORKSPACE_SYNC_IDLE_MAX_INTERVAL_MS = "8000";
    resetWorkspaceRunSyncMetricsForTest();

    const t1 = await runWorkspaceRunSyncTick({ repoRoot: repo });
    assert.strictEqual(t1.activeRuns, 0);
    assert.strictEqual(t1.effectiveIntervalMs, 2000);

    const t2 = await runWorkspaceRunSyncTick({ repoRoot: repo });
    assert.ok(t2.effectiveIntervalMs >= 4000);

    resetWorkspaceRunSyncBackoff();

    const proj = path.join(repo, "backoff-active");
    fs.mkdirSync(proj, { recursive: true });
    upsertProjectFromUsage({ projectRoot: proj, displayName: "Backoff" });
    const pid = deriveProjectId(proj);
    const ws = createWorkspace({ name: "Backoff", projectIds: [pid] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Active" });
    const activeId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(activeId, { order: 0, title: "M", targetProjectId: pid });
    seedWorkspaceGitReady(activeId, [pid]);
    updateWorkspaceRun(activeId, { status: "running" });

    const t3 = await runWorkspaceRunSyncTick({
      repoRoot: repo,
      advanceFn: async () => ({ ok: true, inProgress: true }),
    });
    assert.strictEqual(t3.effectiveIntervalMs, 1000);
  });
});

test("erro em um run não interrompe tick dos restantes", async () => {
  await withIsolated(async ({ repo }) => {
    delete process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP;
    resetWorkspaceRunSyncMetricsForTest();
    const proj = path.join(repo, "err-app");
    fs.mkdirSync(proj, { recursive: true });
    upsertProjectFromUsage({ projectRoot: proj, displayName: "Err" });
    const pid = deriveProjectId(proj);
    const ws = createWorkspace({ name: "Err", projectIds: [pid] });

    const bad = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Bad" });
    const good = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Good" });
    const badId = bad.workspaceRun.workspaceRunId;
    const goodId = good.workspaceRun.workspaceRunId;
    for (const id of [badId, goodId]) {
      addMiniActivity(id, { order: 0, title: "M", targetProjectId: pid });
      seedWorkspaceGitReady(id, [pid]);
      updateWorkspaceRun(id, { status: "running" });
    }

    const tick = await runWorkspaceRunSyncTick({
      repoRoot: repo,
      advanceFn: async (runId) => {
        if (runId === badId) throw new Error("boom");
        return { ok: true, inProgress: true };
      },
    });

    assert.strictEqual(tick.processedLastTick, 2);
    assert.strictEqual(tick.errors, 1);
  });
});

test("sortActiveRunsForSync prioriza running e updatedAt asc", () => {
  const sorted = sortActiveRunsForSync([
    {
      workspaceRunId: "b",
      status: "waiting_user_action",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    {
      workspaceRunId: "a",
      status: "running",
      updatedAt: "2026-01-03T00:00:00.000Z",
    },
    {
      workspaceRunId: "c",
      status: "running",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  assert.deepStrictEqual(
    sorted.map((r) => r.workspaceRunId),
    ["c", "a", "b"],
  );
});

test("workspaceRunSyncCap default 10", () => {
  const prev = process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP;
  delete process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP;
  assert.strictEqual(workspaceRunSyncCap(), 10);
  if (prev === undefined) delete process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP;
  else process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP = prev;
});
