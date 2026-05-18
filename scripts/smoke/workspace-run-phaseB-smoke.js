#!/usr/bin/env node
/**
 * Smoke Fase B — WorkspaceRun estático (registry + validação).
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createWorkspace } = require("../daemon/lib/workspace-registry");
const {
  createWorkspaceRun,
  listWorkspaceRuns,
  getWorkspaceRun,
  updateWorkspaceRun,
  deleteWorkspaceRun,
} = require("../daemon/lib/workspace-run-registry");
const { upsertProjectFromUsage, deriveProjectId } = require("../daemon/lib/project-registry");

function main() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-wsr-smoke-"));
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
    assert.strictEqual(ws.ok, true);

    assert.strictEqual(
      createWorkspaceRun({ workspaceId: "ws_nope", title: "T" }).ok,
      false,
    );

    const ok = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Atividade global smoke",
    });
    assert.strictEqual(ok.ok, true);
    const id = ok.workspaceRun.workspaceRunId;

    assert.strictEqual(listWorkspaceRuns().length, 1);
    assert.strictEqual(
      listWorkspaceRuns({ workspaceId: ws.workspace.workspaceId }).length,
      1,
    );
    assert.strictEqual(getWorkspaceRun(id)?.title, "Atividade global smoke");

    assert.strictEqual(updateWorkspaceRun(id, { status: "planned" }).ok, true);
    assert.strictEqual(deleteWorkspaceRun(id).ok, true);

    console.log("[smoke] workspace-run-phaseB: OK");
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

main();
