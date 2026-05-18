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
} = require("./workspace-run-registry");
const {
  startWorkspaceRun,
  resumeWorkspaceRun,
  advanceWorkspaceRunOrchestration,
  skipMiniActivity,
  retryMiniActivity,
  patchRunIndexWorkspaceLink,
} = require("./workspace-run-orchestrator");
const { persistWorkspaceGit } = require("./workspace-run-git-api");
const { upsertProjectFromUsage, deriveProjectId } = require("./project-registry");
const { writeRunIndex, resolveRunIndexPath } = require("../../../core/run-resolver");

async function withIsolatedDataDir(fn) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-orch-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "daemon", "queue.json"), JSON.stringify({ jobs: [] }), "utf-8");
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  try {
    await fn({ repo, dataDir });
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function seedWorkspaceGitReady(workspaceRunId, projectIds, activityBranch = "feature/workspace-run-test") {
  persistWorkspaceGit(workspaceRunId, {
    activityBranch,
    status: "ready",
    preparedAt: new Date().toISOString(),
    projects: projectIds.map((projectId) => ({
      projectId,
      baseBranch: "main",
      activityBranch,
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

function seedCompletedChildRun(projectRoot, runId) {
  const outputDir = path.join(projectRoot, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  writeRunIndex({ runId, projectRoot, outputDir, workspaceRunId: "wsrun_test", miniActivityId: "ma_1" });
  fs.writeFileSync(
    path.join(outputDir, "run-context.json"),
    JSON.stringify({
      phase2: { status: "ready_for_execution" },
      orchestration: { state: "execution_completed" },
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(outputDir, "orchestration-state.json"),
    JSON.stringify({ state: "execution_completed" }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(outputDir, "orchestration-summary.json"),
    JSON.stringify({
      lifecycle: { phase: "execution_completed" },
      review: { status: "approved" },
      health: "ok",
    }),
    "utf-8",
  );
}

test("start: cria primeiro run filho e grava vínculo no índice", async () => {
  await withIsolatedDataDir(async ({ repo }) => {
    const projDir = path.join(repo, "app-a");
    fs.mkdirSync(projDir, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App A" });
    const projectId = deriveProjectId(projDir);

    const ws = createWorkspace({ name: "Stack", projectIds: [projectId] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Global" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, {
      order: 0,
      title: "Primeira mini atividade longa o suficiente",
      targetProjectId: projectId,
    });
    seedWorkspaceGitReady(runId, [projectId]);

    const childRunId = "20260516-120000-child-run-a";
    let createCalls = 0;
    const result = await startWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        createCalls += 1;
        seedCompletedChildRun(projDir, childRunId);
        return { ok: true, data: { runId: childRunId, jobId: "job-1" } };
      },
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(createCalls, 1);
    const row = getWorkspaceRun(runId);
    assert.strictEqual(row.status, "running");
    assert.strictEqual(row.miniActivities[0].runId, childRunId);
    assert.strictEqual(row.miniActivities[0].status, "running");

    const idx = JSON.parse(fs.readFileSync(resolveRunIndexPath(childRunId), "utf-8"));
    assert.strictEqual(idx.workspace_run_id, runId);
    assert.strictEqual(idx.mini_activity_id, row.miniActivities[0].miniActivityId);
  });
});

test("não duplica runId no resume quando filho ainda em progresso", async () => {
  await withIsolatedDataDir(async ({ repo }) => {
    const projDir = path.join(repo, "app-a");
    fs.mkdirSync(projDir, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App A" });
    const projectId = deriveProjectId(projDir);
    const ws = createWorkspace({ name: "Stack", projectIds: [projectId] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Global" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "Mini A", targetProjectId: projectId });
    seedWorkspaceGitReady(runId, [projectId]);

    let createCalls = 0;
    const childRunId = "20260516-120001-child-run-b";
    await startWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        createCalls += 1;
        return { ok: true, data: { runId: childRunId } };
      },
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });

    await resumeWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        createCalls += 1;
        return { ok: true, data: { runId: "should-not-create" } };
      },
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });

    assert.strictEqual(createCalls, 1);
  });
});

test("dependsOn: segunda mini só após primeira completed", async () => {
  await withIsolatedDataDir(async ({ repo }) => {
    const projA = path.join(repo, "app-a");
    const projB = path.join(repo, "app-b");
    fs.mkdirSync(projA, { recursive: true });
    fs.mkdirSync(projB, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projA, displayName: "A" });
    upsertProjectFromUsage({ projectRoot: projB, displayName: "B" });
    const pidA = deriveProjectId(projA);
    const pidB = deriveProjectId(projB);

    const ws = createWorkspace({ name: "Stack", projectIds: [pidA, pidB] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Global" });
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

    const child1 = "20260516-120010-child-1";
    const child2 = "20260516-120011-child-2";
    let createCalls = 0;

    let polls = 0;
    const resolveFn = (rid) => {
      polls += 1;
      if (rid === child1 && polls >= 2) {
        return { phase: "completed", reason: "execution_completed" };
      }
      return { phase: "running", reason: "in_progress" };
    };

    await startWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        createCalls += 1;
        return { ok: true, data: { runId: child1 } };
      },
      resolveChildStatusFn: resolveFn,
    });

    const afterFirst = getWorkspaceRun(runId);
    assert.strictEqual(afterFirst.miniActivities[0].status, "running");
    assert.strictEqual(createCalls, 1);

    const advanced = await advanceWorkspaceRunOrchestration(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        createCalls += 1;
        return { ok: true, data: { runId: child2 } };
      },
      resolveChildStatusFn: resolveFn,
    });

    assert.strictEqual(advanced.ok, true);
    assert.strictEqual(createCalls, 2);
    const row = getWorkspaceRun(runId);
    assert.strictEqual(row.miniActivities[0].status, "completed");
    assert.strictEqual(row.miniActivities[1].runId, child2);
  });
});

test("failed e waiting_user_action param sequência", async () => {
  await withIsolatedDataDir(async ({ repo }) => {
    const projDir = path.join(repo, "app-a");
    fs.mkdirSync(projDir, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App A" });
    const projectId = deriveProjectId(projDir);
    const ws = createWorkspace({ name: "Stack", projectIds: [projectId] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Global" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "Mini", targetProjectId: projectId });
    seedWorkspaceGitReady(runId, [projectId]);

    const childRunId = "20260516-120020-child-fail";
    const failed = await startWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        const outputDir = path.join(projDir, "docs", ".IA", "outputs", childRunId);
        fs.mkdirSync(outputDir, { recursive: true });
        writeRunIndex({ runId: childRunId, projectRoot: projDir, outputDir });
        return { ok: true, data: { runId: childRunId } };
      },
      resolveChildStatusFn: () => ({ phase: "failed", reason: "execution_failed" }),
    });
    assert.strictEqual(failed.ok, true);
    assert.strictEqual(failed.stopped, "child_failed");
    assert.strictEqual(getWorkspaceRun(runId).status, "failed");

    const wsr2 = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Global 2" });
    const runId2 = wsr2.workspaceRun.workspaceRunId;
    addMiniActivity(runId2, { order: 0, title: "Mini 2", targetProjectId: projectId });
    seedWorkspaceGitReady(runId2, [projectId]);
    const child2 = "20260516-120021-child-wait";
    const waiting = await startWorkspaceRun(runId2, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        const outputDir = path.join(projDir, "docs", ".IA", "outputs", child2);
        fs.mkdirSync(outputDir, { recursive: true });
        writeRunIndex({ runId: child2, projectRoot: projDir, outputDir });
        return { ok: true, data: { runId: child2 } };
      },
      resolveChildStatusFn: () => ({ phase: "waiting_user_action", reason: "awaiting_approval" }),
    });
    assert.strictEqual(waiting.stopped, "waiting_user_action");
    assert.strictEqual(getWorkspaceRun(runId2).status, "waiting_user_action");
  });
});

test("completed agregado quando todas minis terminam", async () => {
  await withIsolatedDataDir(async ({ repo }) => {
    const projDir = path.join(repo, "app-a");
    fs.mkdirSync(projDir, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App A" });
    const projectId = deriveProjectId(projDir);
    const ws = createWorkspace({ name: "Stack", projectIds: [projectId] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Global" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "Only", targetProjectId: projectId });
    seedWorkspaceGitReady(runId, [projectId]);

    const childRunId = "20260516-120030-child-done";
    await startWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => ({ ok: true, data: { runId: childRunId } }),
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });

    const done = await advanceWorkspaceRunOrchestration(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => {
        throw new Error("não deve criar outro run");
      },
      resolveChildStatusFn: () => ({ phase: "completed", reason: "execution_completed" }),
    });

    assert.strictEqual(done.completed, true);
    assert.strictEqual(getWorkspaceRun(runId).status, "completed");
  });
});

test("skip e retry miniActivity", async () => {
  await withIsolatedDataDir(async ({ repo }) => {
    const projDir = path.join(repo, "app-a");
    fs.mkdirSync(projDir, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App A" });
    const projectId = deriveProjectId(projDir);
    const ws = createWorkspace({ name: "Stack", projectIds: [projectId] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Global" });
    const runId = wsr.workspaceRun.workspaceRunId;
    const a = addMiniActivity(runId, { order: 0, title: "A", targetProjectId: projectId });
    const b = addMiniActivity(runId, { order: 1, title: "B", targetProjectId: projectId });
    const idA = a.workspaceRun.miniActivities[0].miniActivityId;
    const idB = b.workspaceRun.miniActivities.find((m) => m.title === "B").miniActivityId;
    seedWorkspaceGitReady(runId, [projectId]);

    let createCalls = 0;
    const mockCreate = async () => {
      createCalls += 1;
      return { ok: true, data: { runId: "20260516-120040-child-b" } };
    };

    const skipped = await skipMiniActivity(runId, idA, {
      repoRoot: repo,
      createRunFromTaskFn: mockCreate,
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });
    assert.strictEqual(skipped.ok, true, skipped.message || skipped.code);
    assert.strictEqual(
      getWorkspaceRun(runId).miniActivities.find((m) => m.miniActivityId === idA).status,
      "skipped",
    );
    assert.strictEqual(createCalls, 1);
    const rowB = getWorkspaceRun(runId).miniActivities.find((m) => m.miniActivityId === idB);
    assert.strictEqual(rowB.status, "running");

    await updateWorkspaceRunForTest(runId, {
      miniActivities: getWorkspaceRun(runId).miniActivities.map((m) =>
        m.miniActivityId === idB ? { ...m, status: "failed", runId: rowB.runId } : m,
      ),
      status: "failed",
    });

    const retried = await retryMiniActivity(runId, idB, {
      repoRoot: repo,
      createRunFromTaskFn: async () => ({ ok: true, data: { runId: "20260516-120041-child-b2" } }),
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });
    assert.strictEqual(retried.ok, true);
    assert.strictEqual(
      getWorkspaceRun(runId).miniActivities.find((m) => m.miniActivityId === idB).status,
      "running",
    );
  });
});

function updateWorkspaceRunForTest(id, patch) {
  const { updateWorkspaceRun } = require("./workspace-run-registry");
  return updateWorkspaceRun(id, patch);
}

test("bloqueia start sem miniActivities e se já running", async () => {
  await withIsolatedDataDir(async ({ repo }) => {
    const projDir = path.join(repo, "app-a");
    fs.mkdirSync(projDir, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App A" });
    const projectId = deriveProjectId(projDir);
    const ws = createWorkspace({ name: "Stack", projectIds: [projectId] });
    const empty = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Empty" });
    const noMini = await startWorkspaceRun(empty.workspaceRun.workspaceRunId, { repoRoot: repo });
    assert.strictEqual(noMini.code, "workspace_run_no_mini_activities");

    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "X" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "M", targetProjectId: projectId });
    seedWorkspaceGitReady(runId, [projectId]);
    await startWorkspaceRun(runId, {
      repoRoot: repo,
      createRunFromTaskFn: async () => ({ ok: true, data: { runId: "20260516-120050-x" } }),
      resolveChildStatusFn: () => ({ phase: "running", reason: "in_progress" }),
    });
    const again = await startWorkspaceRun(runId, { repoRoot: repo });
    assert.strictEqual(again.code, "workspace_run_already_running");
  });
});

test("bloqueia start sem git ready", async () => {
  await withIsolatedDataDir(async ({ repo }) => {
    const projDir = path.join(repo, "app-a");
    fs.mkdirSync(projDir, { recursive: true });
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "App A" });
    const projectId = deriveProjectId(projDir);
    const ws = createWorkspace({ name: "Stack", projectIds: [projectId] });
    const wsr = createWorkspaceRun({ workspaceId: ws.workspace.workspaceId, title: "Auth Refactor" });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "Mini", targetProjectId: projectId });

    const blocked = await startWorkspaceRun(runId, { repoRoot: repo });
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(blocked.code, "workspace_git_not_ready");
  });
});

test("patchRunIndexWorkspaceLink grava campos", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-patch-idx-"));
  const runId = "20260516-120099-patch";
  const outputDir = path.join(root, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  writeRunIndex({ runId, projectRoot: root, outputDir });
  try {
    assert.strictEqual(patchRunIndexWorkspaceLink(runId, "wsrun_x", "ma_y"), true);
    const idx = JSON.parse(fs.readFileSync(resolveRunIndexPath(runId), "utf-8"));
    assert.strictEqual(idx.workspace_run_id, "wsrun_x");
    assert.strictEqual(idx.mini_activity_id, "ma_y");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
