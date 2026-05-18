#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { execFileSync } = require("child_process");

const { createRuntimeApiServer, RUNTIME_API_HOST } = require("../daemon/runtime-api");
const { createWorkspace } = require("../daemon/lib/workspace-registry");
const {
  createWorkspaceRun,
  addMiniActivity,
} = require("../daemon/lib/workspace-run-registry");
const { persistWorkspaceGit } = require("../daemon/lib/workspace-run-git-api");
const { upsertProjectFromUsage, deriveProjectId } = require("../daemon/lib/project-registry");
const { startWorkspaceRun } = require("../daemon/lib/workspace-run-orchestrator");
const { notifyWorkspaceRunSse } = require("../daemon/lib/workspace-run-sse");
const { readSseSample } = require("./lib/e2e-http");
const { REQUIRED_SEED_FILES } = require("../../core/validate-project-knowledge-base");
const { REQUIRED_INDEX_FILES } = require("../../core/validate-ia-governance-structure");

const INDEX_MD = "Version: 1.0\n# .IA\n";

function initGitRepo(root) {
  execFileSync("git", ["init"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["config", "user.email", "smoke@setup-boss.local"], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  execFileSync("git", ["config", "user.name", "Setup Boss Smoke"], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  fs.writeFileSync(path.join(root, "README.md"), "# smoke\n", "utf-8");
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "pipe", windowsHide: true });
}

function gitTrack(root, relPath, content = "# test\n") {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  execFileSync("git", ["add", "--", relPath], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "phasei-seed"], { cwd: root, stdio: "pipe", windowsHide: true });
}

function seedCompliantGitProject(root) {
  initGitRepo(root);
  for (const rel of REQUIRED_SEED_FILES) {
    gitTrack(root, rel, rel === "docs/.IA/index.md" ? INDEX_MD : undefined);
  }
  for (const rel of REQUIRED_INDEX_FILES) {
    gitTrack(root, rel);
  }
  fs.writeFileSync(path.join(root, "task.md"), "# smoke task\n", "utf-8");
  gitTrack(root, "task.md", "# smoke task\n");
}

function httpJson(port, opts) {
  const bodyStr =
    opts.body && typeof opts.body === "object" ? JSON.stringify(opts.body) : undefined;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: RUNTIME_API_HOST,
        port,
        path: opts.path,
        method: opts.method || "GET",
        headers: bodyStr
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch (_) {
            /* */
          }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function seedGit(workspaceRunId, projectIds) {
  persistWorkspaceGit(workspaceRunId, {
    activityBranch: "feature/phasei-sse",
    status: "ready",
    preparedAt: new Date().toISOString(),
    projects: projectIds.map((projectId) => ({
      projectId,
      baseBranch: "main",
      activityBranch: "feature/phasei-sse",
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

async function main() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-phasei-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "daemon", "queue.json"), JSON.stringify({ jobs: [] }), "utf-8");

  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;

  const snap = {
    busy: false,
    currentJobId: null,
    lastError: null,
    pid: 1,
    startedAt: new Date().toISOString(),
    running: true,
  };

  const { server } = createRuntimeApiServer({
    getDaemonSnapshot: () => snap,
    repoRoot: repo,
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, RUNTIME_API_HOST, resolve);
    });
    const port = /** @type {import("net").AddressInfo} */ (server.address()).port;

    const projDir = path.join(repo, "svc-a");
    fs.mkdirSync(projDir, { recursive: true });
    seedCompliantGitProject(projDir);
    upsertProjectFromUsage({ projectRoot: projDir, displayName: "A" });
    const pidA = deriveProjectId(projDir);

    const ws = createWorkspace({ name: "Phase I SSE", projectIds: [pidA] });
    const workspaceId = ws.workspace.workspaceId;
    const wsr = createWorkspaceRun({
      workspaceId,
      title: "SSE smoke",
    });
    const runId = wsr.workspaceRun.workspaceRunId;
    addMiniActivity(runId, { order: 0, title: "Mini A", targetProjectId: pidA });
    seedGit(runId, [pidA]);

    const ssePromise = readSseSample(port, "", 6000).catch(() => "");
    await new Promise((r) => setTimeout(r, 200));
    notifyWorkspaceRunSse("workspace_run.updated", runId);
    const sseRaw = await ssePromise;
    assert.ok(sseRaw.includes("workspace_run.updated"), "SSE deve conter workspace_run.updated");

    const gitSsePromise = readSseSample(port, "", 5000).catch(() => "");
    await new Promise((r) => setTimeout(r, 150));
    const prepare = await httpJson(port, {
      path: `/workspace-runs/${encodeURIComponent(runId)}/prepare-git`,
      method: "POST",
      body: {},
    });
    assert.strictEqual(prepare.status, 200);
    const gitSse = await gitSsePromise;
    assert.ok(
      gitSse.includes("workspace_run.git_updated"),
      "prepare-git deve emitir workspace_run.git_updated",
    );

    const startSsePromise = readSseSample(port, "", 5000).catch(() => "");
    await new Promise((r) => setTimeout(r, 150));
    const start = await httpJson(port, {
      path: `/workspace-runs/${encodeURIComponent(runId)}/start`,
      method: "POST",
    });
    assert.strictEqual(start.status, 200);
    const startSse = await startSsePromise;
    assert.ok(
      startSse.includes("workspace_run.started"),
      `start deve emitir workspace_run.started (status=${start.status})`,
    );

    const resumeSsePromise = readSseSample(port, "", 5000).catch(() => "");
    await new Promise((r) => setTimeout(r, 150));
    const resume = await httpJson(port, {
      path: `/workspace-runs/${encodeURIComponent(runId)}/resume`,
      method: "POST",
    });
    assert.ok([200, 400].includes(resume.status), "resume responde");
    const resumeSse = await resumeSsePromise;
    if (resume.status === 200) {
      assert.ok(
        resumeSse.includes("workspace_run.updated"),
        "resume deve emitir workspace_run.updated",
      );
    }

    const advSsePromise = readSseSample(port, "", 5000).catch(() => "");
    await new Promise((r) => setTimeout(r, 150));
    notifyWorkspaceRunSse("workspace_run.advanced", runId, {
      runId: "child_smoke_phasei",
      miniActivityId: "ma_smoke_phasei",
    });
    const advSse = await advSsePromise;
    assert.ok(
      advSse.includes("workspace_run.advanced"),
      "stream deve transportar workspace_run.advanced",
    );

    console.log("[smoke] workspace-sse-phaseI: OK", { workspaceRunId: runId, port });
  } finally {
    await new Promise((r) => server.close(() => r()));
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData == null) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("[smoke] workspace-sse-phaseI: FAIL", e);
  process.exit(1);
});
