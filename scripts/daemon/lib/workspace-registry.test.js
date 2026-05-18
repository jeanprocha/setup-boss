"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  loadWorkspacesUnsafe,
} = require("./workspace-registry");
const { upsertProjectFromUsage, deriveProjectId, findProjectRecord } = require("./project-registry");

function withIsolatedDataDir(fn) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-"));
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

test("workspace-registry: CRUD e persistência", () => {
  withIsolatedDataDir(({ repo }) => {
    const projDir = path.join(repo, "app-a");
    fs.mkdirSync(projDir, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App A" });
    const projectId = deriveProjectId(projDir);
    assert.ok(findProjectRecord(projectId));

    const bad = createWorkspace({ name: "X", projectIds: ["proj_missing"] });
    assert.strictEqual(bad.ok, false);

    const created = createWorkspace({
      name: "Stack A",
      description: "dois repos",
      projectIds: [projectId],
      primaryProjectId: projectId,
    });
    assert.strictEqual(created.ok, true);
    const wsId = created.workspace.workspaceId;
    assert.match(wsId, /^ws_[a-f0-9]+$/i);

    const payload = loadWorkspacesUnsafe();
    assert.strictEqual(payload.workspaces.length, 1);

    assert.strictEqual(listWorkspaces().length, 1);
    assert.strictEqual(getWorkspace(wsId)?.name, "Stack A");

    const updated = updateWorkspace(wsId, { name: "Stack A+" });
    assert.strictEqual(updated.ok, true);
    assert.strictEqual(getWorkspace(wsId)?.name, "Stack A+");

    const removed = deleteWorkspace(wsId);
    assert.strictEqual(removed.ok, true);
    assert.strictEqual(getWorkspace(wsId), null);
    assert.strictEqual(listWorkspaces().length, 0);
  });
});
