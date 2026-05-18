"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const {
  validateGitExecuteGate,
  isProtectedBranch,
  GIT_BRANCH_READY,
} = require("./validate-git-execute-gate");

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function initGitRepo(root) {
  execFileSync("git", ["init"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["config", "user.email", "test@setup-boss.local"], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  execFileSync("git", ["config", "user.name", "Setup Boss Test"], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  fs.writeFileSync(path.join(root, "README.md"), "# t\n", "utf-8");
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "pipe", windowsHide: true });
}

test("isProtectedBranch reconhece refs protegidas", () => {
  assert.strictEqual(isProtectedBranch("main"), true);
  assert.strictEqual(isProtectedBranch("MASTER"), true);
  assert.strictEqual(isProtectedBranch("setup-boss/feat"), false);
});

test("validateGitExecuteGate: main sem git_branch_ready", () => {
  const root = tmpRoot("sb-git-gate-main-");
  initGitRepo(root);
  const r = validateGitExecuteGate({ projectRoot: root, gitState: null });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "git_branch_required");
});

test("validateGitExecuteGate: main ready mas branch diferente", () => {
  const root = tmpRoot("sb-git-gate-mismatch-");
  initGitRepo(root);
  const r = validateGitExecuteGate({
    projectRoot: root,
    gitState: {
      status: GIT_BRANCH_READY,
      activityBranch: "setup-boss/20260516-test",
    },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "git_branch_mismatch");
});

test("validateGitExecuteGate: permite quando HEAD === activityBranch ready", () => {
  const root = tmpRoot("sb-git-gate-ok-");
  initGitRepo(root);
  const activity = "setup-boss/20260516-ok";
  execFileSync("git", ["checkout", "-b", activity], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  const r = validateGitExecuteGate({
    projectRoot: root,
    gitState: { status: GIT_BRANCH_READY, activityBranch: activity },
  });
  assert.strictEqual(r.ok, true);
});

test("validateGitExecuteGate: repo inválido", () => {
  const root = tmpRoot("sb-git-gate-norepo-");
  fs.mkdirSync(root, { recursive: true });
  const r = validateGitExecuteGate({ projectRoot: root });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "git_not_repository");
});
