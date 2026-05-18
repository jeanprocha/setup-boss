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
  updateMiniActivity,
  deleteMiniActivity,
} = require("../daemon/lib/workspace-run-registry");
const { upsertProjectFromUsage, deriveProjectId } = require("../daemon/lib/project-registry");

function main() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ma-smoke-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;

  try {
    const projDir = path.join(repo, "app");
    fs.mkdirSync(projDir, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App" });
    const projectId = deriveProjectId(projDir);

    const ws = createWorkspace({ name: "Stack", projectIds: [projectId] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Global" });
    const runId = wsr.workspaceRun.workspaceRunId;

    assert.strictEqual(
      addMiniActivity(runId, { order: 0, title: "X", targetProjectId: "proj_nope" }).ok,
      false,
    );

    const ma = addMiniActivity(runId, {
      order: 0,
      title: "Backend",
      targetProjectId: projectId,
    });
    assert.strictEqual(ma.ok, true);

    assert.strictEqual(
      updateMiniActivity(runId, ma.workspaceRun.miniActivities[0].miniActivityId, {
        status: "planned",
      }).ok,
      false,
    );

    const up = updateMiniActivity(runId, ma.workspaceRun.miniActivities[0].miniActivityId, {
      status: "ready",
    });
    assert.strictEqual(up.ok, true);

    const del = deleteMiniActivity(runId, ma.workspaceRun.miniActivities[0].miniActivityId);
    assert.strictEqual(del.ok, true);

    console.log("[smoke] workspace-mini-activities-phaseC: OK");
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

main();
