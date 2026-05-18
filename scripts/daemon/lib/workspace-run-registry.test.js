"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createWorkspace } = require("./workspace-registry");
const {
  createWorkspaceRun,
  listWorkspaceRuns,
  getWorkspaceRun,
  updateWorkspaceRun,
  deleteWorkspaceRun,
  addMiniActivity,
  updateMiniActivity,
  deleteMiniActivity,
  loadWorkspaceRunsUnsafe,
} = require("./workspace-run-registry");
const { upsertProjectFromUsage, deriveProjectId } = require("./project-registry");

function withIsolatedDataDir(fn) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-wsr-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  try {
    fn({ repo, dataDir });
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

test("workspace-run-registry: CRUD, filtro e validações", () => {
  withIsolatedDataDir(({ repo }) => {
    const projDir = path.join(repo, "app-a");
    fs.mkdirSync(projDir, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App A" });
    const projectId = deriveProjectId(projDir);

    const ws = createWorkspace({ name: "Stack", projectIds: [projectId] });
    assert.strictEqual(ws.ok, true);
    const workspaceId = ws.workspace.workspaceId;

    const badWs = createWorkspaceRun({
      workspaceId: "ws_missing",
      title: "X",
    });
    assert.strictEqual(badWs.ok, false);

    const badStatus = createWorkspaceRun({
      workspaceId,
      title: "X",
      status: "invalid",
    });
    assert.strictEqual(badStatus.ok, false);

    const created = createWorkspaceRun({
      workspaceId,
      title: "Implementar feature ponta a ponta",
      description: "smoke",
    });
    assert.strictEqual(created.ok, true);
    const runId = created.workspaceRun.workspaceRunId;
    assert.match(runId, /^wsrun_\d{8}-\d{6}-/);

    assert.strictEqual(loadWorkspaceRunsUnsafe().workspaceRuns.length, 1);
    assert.strictEqual(listWorkspaceRuns().length, 1);
    assert.strictEqual(listWorkspaceRuns({ workspaceId }).length, 1);
    assert.strictEqual(listWorkspaceRuns({ workspaceId: "ws_other" }).length, 0);

    const updated = updateWorkspaceRun(runId, { status: "planned", globalSpec: "# spec" });
    assert.strictEqual(updated.ok, true);
    assert.strictEqual(getWorkspaceRun(runId)?.status, "planned");

    assert.strictEqual(deleteWorkspaceRun(runId).ok, true);
    assert.strictEqual(getWorkspaceRun(runId), null);
  });
});

test("workspace-run-registry: miniActivities CRUD e validações", () => {
  withIsolatedDataDir(({ repo }) => {
    const projDir = path.join(repo, "app-a");
    const projDirB = path.join(repo, "app-b");
    fs.mkdirSync(projDir, { recursive: true });
    fs.mkdirSync(projDirB, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App A" });
    upsertProjectFromUsage({ projectRoot: projDirB, displayName: "App B" });
    const projectIdA = deriveProjectId(projDir);
    const projectIdB = deriveProjectId(projDirB);

    const ws = createWorkspace({ name: "Stack", projectIds: [projectIdA, projectIdB] });
    const workspaceId = ws.workspace.workspaceId;

    const created = createWorkspaceRun({
      workspaceId,
      title: "Global",
    });
    assert.strictEqual(created.ok, true);
    const runId = created.workspaceRun.workspaceRunId;

    const withMini = addMiniActivity(runId, {
      miniActivityId: "ma_api",
      order: 0,
      title: "API",
      targetProjectId: projectIdA,
      status: "pending",
    });
    assert.strictEqual(withMini.ok, true);

    const badTarget = addMiniActivity(runId, {
      order: 1,
      title: "Front",
      targetProjectId: "proj_out",
    });
    assert.strictEqual(badTarget.ok, false);

    const added = addMiniActivity(runId, {
      order: 1,
      title: "Front",
      targetProjectId: projectIdB,
    });
    assert.strictEqual(added.ok, true);
    assert.strictEqual(added.workspaceRun.miniActivities.length, 2);

    const dupOrder = updateWorkspaceRun(runId, {
      miniActivities: [
        withMini.workspaceRun.miniActivities[0],
        { ...added.workspaceRun.miniActivities[1], order: 0 },
      ],
    });
    assert.strictEqual(dupOrder.ok, false);

    const patched = updateMiniActivity(runId, added.workspaceRun.miniActivities[1].miniActivityId, {
      status: "ready",
      runId: "20260516-120000-test-run",
    });
    assert.strictEqual(patched.ok, true);
    assert.ok(patched.workspaceRun.childRunIds.includes("20260516-120000-test-run"));

    const maId = added.workspaceRun.miniActivities[1].miniActivityId;
    const removed = deleteMiniActivity(runId, maId);
    assert.strictEqual(removed.ok, true);
    assert.strictEqual(removed.workspaceRun.miniActivities.length, 1);
  });
});
