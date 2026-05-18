"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const { writeRunIndex } = require("../../../core/run-resolver");
const { resolveRunGitUiEnvelope } = require("./run-git-ui-envelope");

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function initGitRepo(root) {
  execFileSync("git", ["init"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["config", "user.email", "t@local"], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  execFileSync("git", ["config", "user.name", "T"], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  fs.writeFileSync(path.join(root, "README.md"), "# t\n", "utf-8");
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "pipe", windowsHide: true });
}

test("resolveRunGitUiEnvelope em main sem git expõe executeBlockCode", () => {
  const root = tmpRoot("sb-ui-env-main-");
  initGitRepo(root);
  const runId = "20260516-200000-test-ui-env-main";
  const outputDir = path.join(root, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  writeRunIndex({ runId, projectRoot: root, outputDir });
  fs.writeFileSync(
    path.join(outputDir, "run-context.json"),
    JSON.stringify({ phase2: { status: "ready_for_execution" } }, null, 2),
    "utf-8",
  );

  const env = resolveRunGitUiEnvelope({ runId, projectRoot: root });
  assert.strictEqual(env.branchHint, null);
  assert.strictEqual(env.git?.executeBlockCode, "git_branch_required");
});

test("resolveRunGitUiEnvelope com git_branch_ready preenche branchHint", () => {
  const root = tmpRoot("sb-ui-env-ready-");
  initGitRepo(root);
  const activity = "setup-boss/20260516-ui-ready";
  execFileSync("git", ["checkout", "-b", activity], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  const runId = "20260516-200001-test-ui-env-ready";
  const outputDir = path.join(root, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  writeRunIndex({ runId, projectRoot: root, outputDir });
  fs.writeFileSync(
    path.join(outputDir, "run-context.json"),
    JSON.stringify({
      git: { status: "git_branch_ready", activityBranch: activity },
    }, null, 2),
    "utf-8",
  );

  const env = resolveRunGitUiEnvelope({ runId, projectRoot: root });
  assert.strictEqual(env.branchHint, activity);
  assert.strictEqual(env.git?.status, "git_branch_ready");
  assert.strictEqual(env.git?.executeBlockCode, undefined);
});

test("resolveRunGitUiEnvelope com mismatch expõe currentBranch", () => {
  const root = tmpRoot("sb-ui-env-mismatch-");
  initGitRepo(root);
  const expected = "setup-boss/20260516-esperada";
  const actual = "setup-boss/20260516-actual";
  execFileSync("git", ["checkout", "-b", expected], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  execFileSync("git", ["checkout", "-b", actual], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  const runId = "20260516-200002-test-ui-env-mismatch";
  const outputDir = path.join(root, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  writeRunIndex({ runId, projectRoot: root, outputDir });
  fs.writeFileSync(
    path.join(outputDir, "run-context.json"),
    JSON.stringify({
      git: { status: "git_branch_ready", activityBranch: expected },
    }, null, 2),
    "utf-8",
  );

  const env = resolveRunGitUiEnvelope({ runId, projectRoot: root });
  assert.strictEqual(env.git?.executeBlockCode, "git_branch_mismatch");
  assert.strictEqual(env.git?.currentBranch, actual);
  assert.strictEqual(env.git?.activityBranch, expected);
});
