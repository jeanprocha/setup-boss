#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

const { createWorkspace } = require("../daemon/lib/workspace-registry");
const {
  createWorkspaceRun,
  addMiniActivity,
  updateWorkspaceRun,
  listWorkspaceRuns,
} = require("../daemon/lib/workspace-run-registry");
const { persistWorkspaceGit } = require("../daemon/lib/workspace-run-git-api");
const { upsertProjectFromUsage, deriveProjectId } = require("../daemon/lib/project-registry");
const {
  runWorkspaceRunSyncTick,
  startWorkspaceRunSyncLoop,
  stopWorkspaceRunSyncLoop,
  isWorkspaceRunSyncLoopRunning,
  resetWorkspaceRunSyncMetricsForTest,
} = require("../daemon/lib/workspace-run-sync");
const {
  registerSseStreamClient,
  unregisterSseStreamClient,
  getSseObservabilityMetrics,
} = require("../daemon/lib/sse-observability");
const { readDaemonStatus, writeDaemonStatus } = require("../daemon/lib/daemon-status");
const { createRuntimeApiServer } = require("../daemon/runtime-api");

function seedGit(workspaceRunId, projectIds) {
  persistWorkspaceGit(workspaceRunId, {
    activityBranch: "feature/phasej",
    status: "ready",
    preparedAt: new Date().toISOString(),
    projects: projectIds.map((projectId) => ({
      projectId,
      baseBranch: "main",
      activityBranch: "feature/phasej",
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

function getJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: pathname },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
  });
}

async function main() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-phasej-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "daemon", "queue.json"), JSON.stringify({ jobs: [] }), "utf-8");

  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  const prevSync = process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED;
  const prevCap = process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP;
  const prevInterval = process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS;
  const prevIdle = process.env.SETUP_BOSS_WORKSPACE_SYNC_IDLE_MAX_INTERVAL_MS;

  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED = "1";
  process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP = "2";
  process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS = "200";
  process.env.SETUP_BOSS_WORKSPACE_SYNC_IDLE_MAX_INTERVAL_MS = "2000";

  let server;
  let port;

  try {
    resetWorkspaceRunSyncMetricsForTest();

    const proj = path.join(repo, "svc");
    fs.mkdirSync(proj, { recursive: true });
    upsertProjectFromUsage({ projectRoot: proj, displayName: "Svc" });
    const pid = deriveProjectId(proj);
    const ws = createWorkspace({ name: "Phase J", projectIds: [pid] });

    for (let i = 0; i < 3; i++) {
      const wsr = createWorkspaceRun({
        workspaceId: ws.workspace.workspaceId,
        title: `Cap ${i}`,
      });
      const id = wsr.workspaceRun.workspaceRunId;
      addMiniActivity(id, { order: 0, title: "M", targetProjectId: pid });
      seedGit(id, [pid]);
      updateWorkspaceRun(id, { status: "running" });
    }

    const capTick = await runWorkspaceRunSyncTick({
      repoRoot: repo,
      advanceFn: async () => ({ ok: true, inProgress: true }),
    });
    assert.strictEqual(capTick.cap, 2);
    assert.strictEqual(capTick.processedLastTick, 2);
    assert.strictEqual(capTick.skippedByCapLastTick, 1);

    const idle1 = await runWorkspaceRunSyncTick({ repoRoot: repo });
    const idle2 = await runWorkspaceRunSyncTick({ repoRoot: repo });
    assert.ok(idle2.effectiveIntervalMs >= idle1.effectiveIntervalMs);

    for (const row of listWorkspaceRuns()) {
      if (row && (row.status === "running" || row.status === "waiting_user_action")) {
        updateWorkspaceRun(row.workspaceRunId, { status: "draft" });
      }
    }

    registerSseStreamClient();
    const sseBefore = getSseObservabilityMetrics();
    assert.ok(sseBefore.connectedClients >= 1);
    unregisterSseStreamClient();

    const api = createRuntimeApiServer({
      repoRoot: repo,
      getDaemonSnapshot: () => ({
        busy: false,
        currentJobId: null,
        running: true,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      }),
    });
    server = api.server;
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    port = server.address().port;

    writeDaemonStatus({
      workspaceRunSync: {
        enabled: true,
        intervalMs: 200,
        effectiveIntervalMs: 200,
        cap: 2,
        activeRuns: 0,
        processedLastTick: 0,
        skippedByCapLastTick: 0,
        lastTickAt: new Date().toISOString(),
        lastDurationMs: 1,
        totalTicks: 1,
        totalAdvanced: 0,
        totalCompleted: 0,
        totalFailed: 0,
        totalErrors: 0,
        sseConnectedClients: 0,
        sseEventsEmitted: 0,
      },
    });

    const status = await getJson(port, "/status");
    assert.ok(status.ok);
    const sync = status.data.workspaceRunSync;
    assert.ok(sync);
    assert.strictEqual(sync.cap, 2);
    assert.ok(typeof sync.totalTicks === "number");
    assert.ok(typeof sync.sseConnectedClients === "number");

    startWorkspaceRunSyncLoop({ repoRoot: repo });
    assert.ok(isWorkspaceRunSyncLoopRunning());
    await new Promise((r) => setTimeout(r, 350));
    stopWorkspaceRunSyncLoop();
    assert.ok(!isWorkspaceRunSyncLoopRunning());

    const finalTick = await runWorkspaceRunSyncTick({
      repoRoot: repo,
      advanceFn: async () => ({ ok: true, inProgress: true }),
    });
    assert.ok(finalTick.lastTickAt);
    assert.ok(finalTick.totalTicks >= 1);

    const liveStatus = await getJson(port, "/status");
    assert.ok(liveStatus.data.workspaceRunSync.lastTickAt);
    assert.ok(liveStatus.data.workspaceRunSync.totalTicks >= 1);

    const disk = readDaemonStatus();
    assert.ok(disk.workspaceRunSync);
    assert.ok(disk.workspaceRunSync.lastTickAt);

    console.log("smoke:workspace-sync-phaseJ OK");
  } finally {
    if (server) {
      await new Promise((r) => server.close(r));
    }
    stopWorkspaceRunSyncLoop();
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    if (prevSync === undefined) delete process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED;
    else process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED = prevSync;
    if (prevCap === undefined) delete process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP;
    else process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP = prevCap;
    if (prevInterval === undefined) delete process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS;
    else process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS = prevInterval;
    if (prevIdle === undefined) delete process.env.SETUP_BOSS_WORKSPACE_SYNC_IDLE_MAX_INTERVAL_MS;
    else process.env.SETUP_BOSS_WORKSPACE_SYNC_IDLE_MAX_INTERVAL_MS = prevIdle;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
