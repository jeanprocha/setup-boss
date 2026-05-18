"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");
const { execFileSync } = cp;

const {
  gitExecFileSync,
  gitExecInRepoSync,
  gitSpawn,
  isGitRepository,
  getCurrentBranch,
  getHeadCommit,
  isWorkingTreeDirty,
  branchExistsLocal,
  resolveBaseBranchName,
  assertSafeProjectRootForGit,
  GIT_EXEC_FILE_OPTS,
} = require("./git-exec");

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
}

test("isGitRepository: true em repo válido, false fora", () => {
  const root = tmpRoot("sb-git-exec-repo-");
  initGitRepo(root);
  assert.strictEqual(isGitRepository(root), true);
  assert.strictEqual(isGitRepository(tmpRoot("sb-git-exec-norepo-")), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("getCurrentBranch e getHeadCommit após commit inicial", () => {
  const root = tmpRoot("sb-git-exec-branch-");
  initGitRepo(root);
  fs.writeFileSync(path.join(root, "README.md"), "# t\n", "utf-8");
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "pipe", windowsHide: true });

  const branch = getCurrentBranch(root);
  assert.ok(branch === "main" || branch === "master", `branch inesperada: ${branch}`);

  const head = getHeadCommit(root);
  assert.match(head, /^[0-9a-f]{40}$/i);

  fs.rmSync(root, { recursive: true, force: true });
});

test("getCurrentBranch: repo inválido lança GIT_NOT_A_REPOSITORY", () => {
  const dir = tmpRoot("sb-git-exec-notgit-");
  assert.throws(
    () => getCurrentBranch(dir),
    (e) => Boolean(e && typeof e === "object" && "code" in e && e.code === "GIT_NOT_A_REPOSITORY"),
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("assertSafeProjectRootForGit: vazio lança GIT_PROJECT_ROOT_REQUIRED", () => {
  assert.throws(
    () => assertSafeProjectRootForGit("  "),
    (e) =>
      Boolean(e && typeof e === "object" && "code" in e && e.code === "GIT_PROJECT_ROOT_REQUIRED"),
  );
});

test("gitExecFileSync: windowsHide por defeito", (t) => {
  const root = tmpRoot("sb-git-exec-opts-");
  initGitRepo(root);
  const mock = t.mock.method(cp, "execFileSync", (file, args, opts) => {
    if (file === "git") {
      assert.strictEqual(opts.windowsHide, true);
      return Buffer.from(".git\n");
    }
    return execFileSync(file, args, opts);
  });
  try {
    gitExecInRepoSync(root, ["rev-parse", "--git-dir"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    assert.strictEqual(GIT_EXEC_FILE_OPTS.windowsHide, true);
  } finally {
    mock.mock.restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("gitExecFileSync: timeout configurável", (t) => {
  const root = tmpRoot("sb-git-exec-timeout-");
  initGitRepo(root);
  const mock = t.mock.method(cp, "execFileSync", (file, args, opts) => {
    if (file === "git") {
      assert.strictEqual(opts.timeout, 5);
      const e = new Error("timeout");
      e.code = "ETIMEDOUT";
      throw e;
    }
    return execFileSync(file, args, opts);
  });
  try {
    assert.throws(
      () =>
        gitExecFileSync(["-C", root, "status"], {
          timeout: 5,
          stdio: ["ignore", "pipe", "ignore"],
        }),
      (e) => e instanceof Error,
    );
  } finally {
    mock.mock.restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolveBaseBranchName após init", () => {
  const root = tmpRoot("sb-git-exec-base-branch-");
  initGitRepo(root);
  const base = resolveBaseBranchName(root);
  assert.ok(base === "main" || base === "master");
  assert.strictEqual(isWorkingTreeDirty(root), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("gitSpawn: rejeita com git_failed quando exit != 0", async () => {
  const root = tmpRoot("sb-git-spawn-fail-");
  initGitRepo(root);
  await assert.rejects(
    () =>
      gitSpawn(["-C", root, "checkout", "branch-que-nao-existe-xyz"], {
        timeoutMs: 5000,
      }),
    (e) => Boolean(e && typeof e === "object" && "code" in e && e.code === "git_failed"),
  );
  fs.rmSync(root, { recursive: true, force: true });
});
