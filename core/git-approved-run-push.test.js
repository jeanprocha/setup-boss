"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const {
  tryGitPushAfterApprovedCommit,
  isGitAutoPushEnabled,
  GIT_PUSH_ERROR,
  GIT_PUSH_STATUS,
  persistGitPushState,
} = require("./git-approved-run-push");
const { GIT_BRANCH_READY, GIT_COMMIT_STATUS } = require("./git-approved-run-commit");

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

/**
 * @param {string} workRoot
 */
function setupProjectWithBareOrigin(workRoot) {
  const bare = path.join(workRoot, "remote.git");
  fs.mkdirSync(bare, { recursive: true });
  execFileSync("git", ["init", "--bare"], { cwd: bare, stdio: "pipe", windowsHide: true });

  const root = path.join(workRoot, "project");
  fs.mkdirSync(root, { recursive: true });
  initGitRepo(root);
  execFileSync("git", ["remote", "add", "origin", bare], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  return { root, bare };
}

/**
 * @param {string} outputDir
 * @param {string} activity
 * @param {{ commit?: boolean, push?: Record<string, unknown>|null }} [opts]
 */
function writeRunGitContext(outputDir, activity, opts = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const git = {
    enabled: true,
    status: GIT_BRANCH_READY,
    activityBranch: activity,
  };
  if (opts.commit !== false) {
    git.commit = {
      status: GIT_COMMIT_STATUS.COMMITTED,
      sha: "abc123def456",
      message: "setup-boss: test",
      createdAt: new Date().toISOString(),
    };
  }
  if (opts.push) git.push = opts.push;
  fs.writeFileSync(
    path.join(outputDir, "run-context.json"),
    JSON.stringify({ git }, null, 2),
    "utf-8",
  );
}

test("isGitAutoPushEnabled só com true explícito", () => {
  assert.strictEqual(isGitAutoPushEnabled({ SETUP_BOSS_GIT_AUTO_PUSH: "true" }), true);
  assert.strictEqual(isGitAutoPushEnabled({ SETUP_BOSS_GIT_AUTO_PUSH: "false" }), false);
  assert.strictEqual(isGitAutoPushEnabled({}), false);
});

test("flag false não faz push", () => {
  const work = tmpRoot("sb-push-off-");
  const { root } = setupProjectWithBareOrigin(work);
  const out = path.join(root, ".setup-boss", "runs", "r1");
  const activity = "setup-boss/off";
  execFileSync("git", ["checkout", "-b", activity], { cwd: root, stdio: "pipe", windowsHide: true });
  writeRunGitContext(out, activity);

  const r = tryGitPushAfterApprovedCommit({
    projectRoot: root,
    outputDir: out,
    runId: "r1",
    env: { SETUP_BOSS_GIT_AUTO_PUSH: "false" },
    writeReport: false,
  });
  assert.strictEqual(r.skipped, true);
  assert.strictEqual(r.code, GIT_PUSH_ERROR.DISABLED);
});

test("sem commit aprovado não faz push", () => {
  const work = tmpRoot("sb-push-nocommit-");
  const { root } = setupProjectWithBareOrigin(work);
  const out = path.join(root, ".setup-boss", "runs", "r2");
  const activity = "setup-boss/nocommit";
  execFileSync("git", ["checkout", "-b", activity], { cwd: root, stdio: "pipe", windowsHide: true });
  writeRunGitContext(out, activity, { commit: false });

  const r = tryGitPushAfterApprovedCommit({
    projectRoot: root,
    outputDir: out,
    runId: "r2",
    env: { SETUP_BOSS_GIT_AUTO_PUSH: "true" },
    writeReport: false,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_PUSH_ERROR.COMMIT_REQUIRED);
});

test("branch mismatch bloqueia", () => {
  const work = tmpRoot("sb-push-mismatch-");
  const { root } = setupProjectWithBareOrigin(work);
  const out = path.join(root, ".setup-boss", "runs", "r3");
  const activity = "setup-boss/right";
  execFileSync("git", ["checkout", "-b", activity], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["checkout", "-b", "other"], { cwd: root, stdio: "pipe", windowsHide: true });
  writeRunGitContext(out, activity);

  const r = tryGitPushAfterApprovedCommit({
    projectRoot: root,
    outputDir: out,
    runId: "r3",
    env: { SETUP_BOSS_GIT_AUTO_PUSH: "true" },
    writeReport: false,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_PUSH_ERROR.BRANCH_MISMATCH);
});

test("branch protegida bloqueia", () => {
  const work = tmpRoot("sb-push-prot-");
  const root = path.join(work, "project");
  fs.mkdirSync(root, { recursive: true });
  initGitRepo(root);
  const defaultBranch = String(
    execFileSync("git", ["branch", "--show-current"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ).trim();
  const out = path.join(root, ".setup-boss", "runs", "r4");
  writeRunGitContext(out, defaultBranch || "master");

  const r = tryGitPushAfterApprovedCommit({
    projectRoot: root,
    outputDir: out,
    runId: "r4",
    env: { SETUP_BOSS_GIT_AUTO_PUSH: "true" },
    writeReport: false,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_PUSH_ERROR.PROTECTED_BRANCH);
});

test("sem remote origin bloqueia", () => {
  const root = tmpRoot("sb-push-noremote-");
  initGitRepo(root);
  const activity = "setup-boss/noremote";
  execFileSync("git", ["checkout", "-b", activity], { cwd: root, stdio: "pipe", windowsHide: true });
  const out = path.join(root, ".setup-boss", "runs", "r5");
  writeRunGitContext(out, activity);

  const r = tryGitPushAfterApprovedCommit({
    projectRoot: root,
    outputDir: out,
    runId: "r5",
    env: { SETUP_BOSS_GIT_AUTO_PUSH: "true" },
    writeReport: false,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_PUSH_ERROR.NO_REMOTE);
});

test("happy path com push -u", () => {
  const work = tmpRoot("sb-push-ok-");
  const { root } = setupProjectWithBareOrigin(work);
  const out = path.join(root, ".setup-boss", "runs", "r6");
  const activity = "setup-boss/push-ok";
  execFileSync("git", ["checkout", "-b", activity], { cwd: root, stdio: "pipe", windowsHide: true });
  fs.writeFileSync(path.join(root, "feature.txt"), "x\n", "utf-8");
  execFileSync("git", ["add", "feature.txt"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "feat"], { cwd: root, stdio: "pipe", windowsHide: true });
  writeRunGitContext(out, activity);

  const r = tryGitPushAfterApprovedCommit({
    projectRoot: root,
    outputDir: out,
    runId: "r6",
    env: { SETUP_BOSS_GIT_AUTO_PUSH: "true" },
    writeReport: false,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.remote, "origin");
  assert.strictEqual(r.branch, activity);
  assert.strictEqual(r.setUpstream, true);

  const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
  assert.strictEqual(ctx.git.push.status, GIT_PUSH_STATUS.PUSHED);
});

test("idempotência quando já pushed", () => {
  const work = tmpRoot("sb-push-idem-");
  const { root } = setupProjectWithBareOrigin(work);
  const out = path.join(root, ".setup-boss", "runs", "r7");
  const activity = "setup-boss/idempotent";
  execFileSync("git", ["checkout", "-b", activity], { cwd: root, stdio: "pipe", windowsHide: true });
  fs.writeFileSync(path.join(root, "b.txt"), "b\n", "utf-8");
  execFileSync("git", ["add", "b.txt"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "b"], { cwd: root, stdio: "pipe", windowsHide: true });
  writeRunGitContext(out, activity);

  const first = tryGitPushAfterApprovedCommit({
    projectRoot: root,
    outputDir: out,
    runId: "r7",
    env: { SETUP_BOSS_GIT_AUTO_PUSH: "true" },
    writeReport: false,
  });
  assert.strictEqual(first.ok, true);

  const second = tryGitPushAfterApprovedCommit({
    projectRoot: root,
    outputDir: out,
    runId: "r7",
    env: { SETUP_BOSS_GIT_AUTO_PUSH: "true" },
    writeReport: false,
  });
  assert.strictEqual(second.skipped, true);
  assert.strictEqual(second.reason, "already_pushed");
});

test("erro de push persiste failed", () => {
  const root = tmpRoot("sb-push-fail-");
  initGitRepo(root);
  const activity = "setup-boss/fail-push";
  execFileSync("git", ["checkout", "-b", activity], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["remote", "add", "origin", path.join(root, "missing-remote.git")], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  fs.writeFileSync(path.join(root, "c.txt"), "c\n", "utf-8");
  execFileSync("git", ["add", "c.txt"], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "c"], { cwd: root, stdio: "pipe", windowsHide: true });
  const out = path.join(root, ".setup-boss", "runs", "r8");
  writeRunGitContext(out, activity);

  const r = tryGitPushAfterApprovedCommit({
    projectRoot: root,
    outputDir: out,
    runId: "r8",
    env: { SETUP_BOSS_GIT_AUTO_PUSH: "true" },
    writeReport: false,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_PUSH_ERROR.FAILED);

  const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
  assert.strictEqual(ctx.git.push.status, GIT_PUSH_STATUS.FAILED);
  assert.strictEqual(ctx.git.push.errorCode, GIT_PUSH_ERROR.FAILED);
  assert.ok(!String(ctx.git.push.errorMessage).includes("http"));
});

test("persistGitPushState grava push", () => {
  const out = tmpRoot("sb-push-persist-");
  persistGitPushState(out, {
    status: GIT_PUSH_STATUS.PUSHED,
    remote: "origin",
    branch: "x",
    pushedAt: "2026-05-16T00:00:00.000Z",
  });
  const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
  assert.strictEqual(ctx.git.push.branch, "x");
});
