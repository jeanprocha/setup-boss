"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createWorkspace } = require("./workspace-registry");
const { createWorkspaceRun, addMiniActivity, getWorkspaceRun } = require("./workspace-run-registry");
const { upsertProjectFromUsage, deriveProjectId } = require("./project-registry");
const {
  reconcileMiniActivities,
  reconcileWorkspaceRun,
  deriveAggregatedWorkspaceRunStatus,
} = require("./workspace-run-reconcile");
const { tryAcquireWorkspaceRunLock, releaseWorkspaceRunLock } = require("./workspace-run-lock");

function withDataDir(fn) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-recon-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  return fn(repo).finally(() => {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  });
}

test("reconcile: mini running sem runId → ready", async () => {
  await withDataDir(async () => {
    const proj = path.join(process.env.SETUP_BOSS_CLI_ROOT, "app");
    fs.mkdirSync(proj, { recursive: true });
    upsertProjectFromUsage({ projectRoot: proj, displayName: "App" });
    const pid = deriveProjectId(proj);
    const ws = createWorkspace({ name: "W", projectIds: [pid] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "R" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, {
      order: 0,
      title: "Stuck",
      targetProjectId: pid,
      status: "running",
    });
    const result = reconcileWorkspaceRun(runId);
    assert.strictEqual(result.changed, true);
    assert.strictEqual(getWorkspaceRun(runId).miniActivities[0].status, "ready");
  });
});

test("deriveAggregatedWorkspaceRunStatus: completed e failed", () => {
  assert.strictEqual(
    deriveAggregatedWorkspaceRunStatus([
      { status: "completed" },
      { status: "skipped" },
    ]),
    "completed",
  );
  assert.strictEqual(
    deriveAggregatedWorkspaceRunStatus([{ status: "failed" }]),
    "failed",
  );
  assert.strictEqual(
    deriveAggregatedWorkspaceRunStatus([
      { status: "waiting_user_action" },
      { status: "pending" },
    ]),
    "waiting_user_action",
  );
});

test("workspace run lock: mesmo pid reentrante", async () => {
  await withDataDir(async () => {
    const ac1 = tryAcquireWorkspaceRunLock("wsrun_test", { pid: process.pid, label: "t" });
    assert.strictEqual(ac1.ok, true);
    const ac2 = tryAcquireWorkspaceRunLock("wsrun_test", { pid: process.pid, label: "t" });
    assert.strictEqual(ac2.ok, true);
    releaseWorkspaceRunLock("wsrun_test", process.pid);
  });
});

test("reconcileMiniActivities: sem alteração quando consistente", () => {
  const r = reconcileMiniActivities([
    {
      miniActivityId: "ma_1",
      order: 0,
      title: "Ok",
      description: null,
      targetProjectId: "p1",
      status: "pending",
      runId: null,
      dependsOnMiniActivityIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  assert.strictEqual(r.changed, false);
});
