#!/usr/bin/env node
/**
 * Smoke Fase A — modelo Workspace (registry + validação, sem HTTP).
 * Uso: node scripts/smoke/workspace-phaseA-smoke.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { upsertProjectFromUsage, deriveProjectId } = require("../daemon/lib/project-registry");
const {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
} = require("../daemon/lib/workspace-registry");

function main() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-smoke-"));
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

    const fail = createWorkspace({ name: "", projectIds: [] });
    assert.strictEqual(fail.ok, false);

    const ok = createWorkspace({
      name: "Smoke WS",
      projectIds: [projectId],
    });
    assert.strictEqual(ok.ok, true);
    const id = ok.workspace.workspaceId;

    assert.strictEqual(listWorkspaces().length, 1);
    assert.strictEqual(getWorkspace(id)?.name, "Smoke WS");

    const up = updateWorkspace(id, { description: "ok" });
    assert.strictEqual(up.ok, true);
    assert.strictEqual(getWorkspace(id)?.description, "ok");

    assert.strictEqual(deleteWorkspace(id).ok, true);
    assert.strictEqual(listWorkspaces().length, 0);

    console.log("[smoke] workspace-phaseA: OK");
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

main();
