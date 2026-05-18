"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const {
  GIT_BRANCH_READY,
  GIT_COMMIT_ERROR,
  GIT_COMMIT_STATUS,
  tryGitCommitAfterApprovedRun,
  validateCommitScope,
  persistGitCommitState,
} = require("./git-approved-run-commit");

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
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", ".IA", "index.md"), "# ia\n", "utf-8");
  fs.writeFileSync(path.join(root, "README.md"), "# t\n", "utf-8");
  execFileSync("git", ["add", "."], { cwd: root, stdio: "pipe", windowsHide: true });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "pipe", windowsHide: true });
}

/**
 * @param {string} root
 * @param {string} activity
 */
function checkoutActivityBranch(root, activity) {
  execFileSync("git", ["checkout", "-b", activity], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
}

/**
 * @param {string} outputDir
 * @param {Record<string, unknown>} gitPatch
 */
function writeRunContext(outputDir, gitPatch) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "run-context.json"),
    JSON.stringify(
      {
        execution_context: { allowed_files: ["src/app.js"] },
        git: { enabled: true, ...gitPatch },
      },
      null,
      2,
    ),
    "utf-8",
  );
}

/**
 * @param {string} outputDir
 * @param {string} status
 */
function writeReview(outputDir, status) {
  fs.writeFileSync(
    path.join(outputDir, "review-output.json"),
    JSON.stringify({ status }, null, 2),
    "utf-8",
  );
}

test("não commita sem git_branch_ready", async () => {
  const root = tmpRoot("sb-gc-noready-");
  const out = path.join(root, ".setup-boss", "runs", "r1");
  initGitRepo(root);
  const activity = "setup-boss/test";
  checkoutActivityBranch(root, activity);
  writeRunContext(out, { status: "git_branch_pending", activityBranch: activity });
  writeReview(out, "approved");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), "x\n", "utf-8");

  const r = await tryGitCommitAfterApprovedRun({
    projectRoot: root,
    outputDir: out,
    runId: "r1",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_COMMIT_ERROR.BRANCH_REQUIRED);
  const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
  assert.strictEqual(ctx.git.commit.status, GIT_COMMIT_STATUS.FAILED);
});

test("não commita em branch protegida", async () => {
  const root = tmpRoot("sb-gc-prot-");
  const out = path.join(root, ".setup-boss", "runs", "r2");
  initGitRepo(root);
  writeRunContext(out, {
    status: GIT_BRANCH_READY,
    activityBranch: "main",
  });
  writeReview(out, "approved");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), "c\n", "utf-8");

  const r = await tryGitCommitAfterApprovedRun({
    projectRoot: root,
    outputDir: out,
    runId: "r2",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_COMMIT_ERROR.PROTECTED_BRANCH);
});

test("não commita com branch mismatch", async () => {
  const root = tmpRoot("sb-gc-mismatch-");
  const out = path.join(root, ".setup-boss", "runs", "r3");
  initGitRepo(root);
  const activity = "setup-boss/activity";
  checkoutActivityBranch(root, activity);
  execFileSync("git", ["checkout", "-b", "other-branch"], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  writeRunContext(out, { status: GIT_BRANCH_READY, activityBranch: activity });
  writeReview(out, "approved");

  const r = await tryGitCommitAfterApprovedRun({
    projectRoot: root,
    outputDir: out,
    runId: "r3",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_COMMIT_ERROR.BRANCH_MISMATCH);
});

test("não commita se review REJECTED/BLOCKED", async () => {
  const root = tmpRoot("sb-gc-rej-");
  const out = path.join(root, ".setup-boss", "runs", "r4");
  initGitRepo(root);
  const activity = "setup-boss/x";
  checkoutActivityBranch(root, activity);
  writeRunContext(out, { status: GIT_BRANCH_READY, activityBranch: activity });
  writeReview(out, "rejected");

  const r1 = await tryGitCommitAfterApprovedRun({
    projectRoot: root,
    outputDir: out,
    runId: "r4",
  });
  assert.strictEqual(r1.skipped, true);
  assert.strictEqual(r1.reason, "review_not_approved");

  writeReview(out, "blocked");
  const r2 = await tryGitCommitAfterApprovedRun({
    projectRoot: root,
    outputDir: out,
    runId: "r4",
  });
  assert.strictEqual(r2.skipped, true);
});

test("não commita se não houver mudanças", async () => {
  const root = tmpRoot("sb-gc-empty-");
  const out = path.join(root, ".setup-boss", "runs", "r5");
  initGitRepo(root);
  const activity = "setup-boss/empty";
  checkoutActivityBranch(root, activity);
  writeRunContext(out, { status: GIT_BRANCH_READY, activityBranch: activity });
  writeReview(out, "approved");

  const r = await tryGitCommitAfterApprovedRun({
    projectRoot: root,
    outputDir: out,
    runId: "r5",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_COMMIT_ERROR.NO_CHANGES);
});

test("bloqueia mudanças fora do escopo", async () => {
  const root = tmpRoot("sb-gc-scope-");
  const out = path.join(root, ".setup-boss", "runs", "r6");
  initGitRepo(root);
  const activity = "setup-boss/scope";
  checkoutActivityBranch(root, activity);
  writeRunContext(out, { status: GIT_BRANCH_READY, activityBranch: activity });
  writeReview(out, "approved");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), "ok\n", "utf-8");
  fs.writeFileSync(path.join(root, "secret.txt"), "nope\n", "utf-8");

  const r = await tryGitCommitAfterApprovedRun({
    projectRoot: root,
    outputDir: out,
    runId: "r6",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_COMMIT_ERROR.OUT_OF_SCOPE);
  assert.ok(Array.isArray(r.outOfScope));
});

test("commita happy path e grava sha", async () => {
  const root = tmpRoot("sb-gc-ok-");
  const out = path.join(root, ".setup-boss", "runs", "r7");
  initGitRepo(root);
  const activity = "setup-boss/happy";
  checkoutActivityBranch(root, activity);
  writeRunContext(out, {
    status: GIT_BRANCH_READY,
    activityBranch: activity,
    task: { title: "Minha task" },
  });
  writeReview(out, "approved");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), "console.log(1)\n", "utf-8");
  fs.writeFileSync(
    path.join(out, "metadata.json"),
    JSON.stringify({ projectId: "proj-1" }),
    "utf-8",
  );

  const r = await tryGitCommitAfterApprovedRun({
    projectRoot: root,
    outputDir: out,
    runId: "r7",
  });
  assert.strictEqual(r.ok, true);
  assert.ok(r.sha && /^[0-9a-f]{7,40}$/i.test(String(r.sha)));

  const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
  assert.strictEqual(ctx.git.commit.status, GIT_COMMIT_STATUS.COMMITTED);
  assert.strictEqual(ctx.git.commit.sha, r.sha);
  assert.ok(String(ctx.git.commit.message).startsWith("setup-boss:"));
});

test("erro de commit grava status failed", async () => {
  const root = tmpRoot("sb-gc-fail-");
  const out = path.join(root, ".setup-boss", "runs", "r8");
  initGitRepo(root);
  const activity = "setup-boss/fail";
  checkoutActivityBranch(root, activity);
  writeRunContext(out, { status: GIT_BRANCH_READY, activityBranch: activity });
  writeReview(out, "approved");

  const scope = validateCommitScope(
    root,
    ["src/missing.js"],
    "",
    { execution_context: { allowed_files: ["src/missing.js"] } },
    out,
  );
  assert.strictEqual(scope.ok, true);
  assert.strictEqual(scope.pathsToStage.length, 0);

  const r = await tryGitCommitAfterApprovedRun({
    projectRoot: root,
    outputDir: out,
    runId: "r8",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_COMMIT_ERROR.NO_CHANGES);

  persistGitCommitState(out, {
    status: GIT_COMMIT_STATUS.FAILED,
    errorCode: GIT_COMMIT_ERROR.FAILED,
    errorMessage: "simulado",
  });
  const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
  assert.strictEqual(ctx.git.commit.status, GIT_COMMIT_STATUS.FAILED);
  assert.strictEqual(ctx.git.commit.errorCode, GIT_COMMIT_ERROR.FAILED);
});
