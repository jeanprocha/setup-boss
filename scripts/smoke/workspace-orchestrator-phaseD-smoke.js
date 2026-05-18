#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createWorkspace } = require("../daemon/lib/workspace-registry");
const { createWorkspaceRun, addMiniActivity } = require("../daemon/lib/workspace-run-registry");
const { startWorkspaceRun, resumeWorkspaceRun } = require("../daemon/lib/workspace-run-orchestrator");
const { upsertProjectFromUsage, deriveProjectId } = require("../daemon/lib/project-registry");
const { resolveRunIndexPath } = require("../../core/run-resolver");

async function main() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-orch-smoke-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "daemon", "queue.json"), JSON.stringify({ jobs: [] }), "utf-8");
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
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Smoke orchestrator" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "Smoke mini activity", targetProjectId: projectId });

    const childRunId = "20260516-130000-smoke-child";
    const outputDir = path.join(projDir, "docs", ".IA", "outputs", childRunId);
    const started = await startWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        fs.mkdirSync(outputDir, { recursive: true });
        const { writeRunIndex } = require("../../core/run-resolver");
        writeRunIndex({ runId: childRunId, projectRoot: projDir, outputDir });
        return { ok: true, data: { runId: childRunId } };
      },
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });
    assert.strictEqual(started.ok, true);
    assert.strictEqual(started.workspaceRun.miniActivities[0].runId, childRunId);

    const idx = JSON.parse(fs.readFileSync(resolveRunIndexPath(childRunId), "utf-8"));
    assert.strictEqual(idx.workspace_run_id, runId);
    assert.ok(idx.mini_activity_id);

    const resumed = await resumeWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        throw new Error("resume não deve criar run duplicado");
      },
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });
    assert.strictEqual(resumed.ok, true);

    console.log("[smoke] workspace-orchestrator-phaseD: OK");
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
