"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const { createWorkspace } = require("../daemon/lib/workspace-registry");
const { createWorkspaceRun, addMiniActivity } = require("../daemon/lib/workspace-run-registry");
const { upsertProjectFromUsage, deriveProjectId } = require("../daemon/lib/project-registry");
const {
  prepareWorkspaceRunGit,
  getWorkspaceRunGitStatus,
} = require("../daemon/lib/workspace-run-git-api");
const { suggestWorkspaceActivityBranchName } = require("../../core/suggest-workspace-activity-branch");
const { getCurrentBranch } = require("../../core/git-exec");

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

async function main() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-git-smoke-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "daemon", "queue.json"), JSON.stringify({ jobs: [] }), "utf-8");
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;

  const projA = path.join(repo, "service-a");
  const projB = path.join(repo, "service-b");
  fs.mkdirSync(projA, { recursive: true });
  fs.mkdirSync(projB, { recursive: true });
  initGitRepo(projA);
  initGitRepo(projB);
  upsertProjectFromUsage({ projectRoot: projA, displayName: "Service A" });
  upsertProjectFromUsage({ projectRoot: projB, displayName: "Service B" });
  const pidA = deriveProjectId(projA);
  const pidB = deriveProjectId(projB);

  const ws = createWorkspace({ name: "Smoke Stack", projectIds: [pidA, pidB] });
  const wsr = createWorkspaceRun({
    workspaceId: ws.workspace.workspaceId,
    title: "Auth Refactor Global",
  });
  const runId = wsr.workspaceRun.workspaceRunId;
  addMiniActivity(runId, { order: 0, title: "Backend", targetProjectId: pidA });
  addMiniActivity(runId, { order: 1, title: "Frontend", targetProjectId: pidB });

  const branchA = suggestWorkspaceActivityBranchName("Auth Refactor Global", runId);
  const branchB = suggestWorkspaceActivityBranchName("Auth Refactor Global", runId);
  if (branchA !== branchB) throw new Error("branch naming not deterministic");

  const prep = await prepareWorkspaceRunGit(runId);
  if (!prep.ok) throw new Error(`prepare-git failed: ${prep.message}`);
  if (prep.git.status !== "ready") throw new Error(`expected ready, got ${prep.git.status}`);
  if (getCurrentBranch(projA) !== prep.git.activityBranch) {
    throw new Error("project A not on activity branch");
  }
  if (getCurrentBranch(projB) !== prep.git.activityBranch) {
    throw new Error("project B not on activity branch");
  }

  const prep2 = await prepareWorkspaceRunGit(runId);
  if (!prep2.ok || prep2.idempotent !== true) {
    throw new Error("second prepare should be idempotent");
  }

  const status = getWorkspaceRunGitStatus(runId);
  if (!status.ready) throw new Error("git-status not ready");

  console.log("[smoke] workspace-git-phaseE: OK", {
    workspaceRunId: runId,
    activityBranch: prep.git.activityBranch,
  });
}

main().catch((err) => {
  console.error("[smoke] workspace-git-phaseE: FAIL", err);
  process.exit(1);
});
