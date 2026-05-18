"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const {
  normalizeReviewOutputFromExecutionBundle,
  isPreservedReviewOutput,
  hasClearApprovedEvidence,
} = require("./normalize-review-output-from-bundle");
const { runPostReviewApprovedGitCommit } = require("../scripts/daemon/lib/run-git-commit-after-review");
const { GIT_BRANCH_READY, GIT_COMMIT_STATUS } = require("./git-approved-run-commit");

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * @param {Record<string, unknown>} bundleData
 */
function approvedBundle(bundleData = {}) {
  return {
    ok: true,
    data: {
      summary: {
        review: {
          status: "approved",
          rejectionReason: null,
          reviewerHint: null,
          decidedAt: "2026-05-16T12:00:00.000Z",
        },
      },
      subtasks: [
        {
          id: "001",
          state: "completed",
          review: { status: "approved", decidedAt: "2026-05-16T12:00:00.000Z" },
        },
      ],
      ...bundleData,
    },
  };
}

test("execute-only com review approved no bundle gera review-output.json", () => {
  const out = tmpRoot("sb-norm-write-");
  const r = normalizeReviewOutputFromExecutionBundle(out, "run-a", {
    bundle: approvedBundle(),
  });
  assert.strictEqual(r.action, "written");
  assert.ok(fs.existsSync(path.join(out, "review-output.json")));
  const doc = JSON.parse(fs.readFileSync(path.join(out, "review-output.json"), "utf-8"));
  assert.strictEqual(doc.status, "approved");
  assert.strictEqual(doc.requires_correction, false);
  assert.ok(doc.normalization);
});

test("review rejected no bundle não gera review-output.json aprovado", () => {
  const out = tmpRoot("sb-norm-rej-");
  const r = normalizeReviewOutputFromExecutionBundle(out, "run-b", {
    bundle: approvedBundle({
      summary: { review: { status: "rejected" } },
      subtasks: [
        {
          id: "001",
          state: "completed",
          review: { status: "rejected", rejectionReason: "fail" },
        },
      ],
    }),
  });
  assert.strictEqual(r.action, "skipped");
  assert.strictEqual(r.reason, "bundle_review_terminal");
  assert.ok(!fs.existsSync(path.join(out, "review-output.json")));
});

test("review-output.json existente válido não é sobrescrito", () => {
  const out = tmpRoot("sb-norm-keep-");
  const existing = {
    status: "approved",
    requires_correction: false,
    blocking_issues: [],
    warnings: [],
    summary: "original",
  };
  fs.writeFileSync(path.join(out, "review-output.json"), JSON.stringify(existing, null, 2));

  const r = normalizeReviewOutputFromExecutionBundle(out, "run-c", {
    bundle: approvedBundle(),
  });
  assert.strictEqual(r.action, "preserved");
  const doc = JSON.parse(fs.readFileSync(path.join(out, "review-output.json"), "utf-8"));
  assert.strictEqual(doc.summary, "original");
});

test("bundle incompleto não gera approved artificial", () => {
  const out = tmpRoot("sb-norm-inc-");
  const r = normalizeReviewOutputFromExecutionBundle(out, "run-d", {
    bundle: approvedBundle({
      summary: { review: { status: "approved" } },
      subtasks: [
        { id: "001", state: "completed", review: { status: "none" } },
        { id: "002", state: "completed", review: { status: "approved" } },
      ],
    }),
  });
  assert.strictEqual(r.action, "skipped");
  assert.strictEqual(r.reason, "insufficient_evidence");
  assert.ok(!hasClearApprovedEvidence(/** @type {Record<string, unknown>} */ (approvedBundle({
    subtasks: [
      { id: "001", state: "completed", review: { status: "none" } },
      { id: "002", state: "completed", review: { status: "approved" } },
    ],
  }).data)));
});

test("isPreservedReviewOutput reconhece approved válido", () => {
  assert.strictEqual(
    isPreservedReviewOutput({ status: "approved", requires_correction: false }),
    true,
  );
  assert.strictEqual(isPreservedReviewOutput({ status: "approved" }), false);
});

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

test("commit roda após normalização no fluxo execute-only", async () => {
  const root = tmpRoot("sb-norm-commit-");
  const out = path.join(root, ".setup-boss", "runs", "run-e");
  initGitRepo(root);
  const activity = "setup-boss/exec-only";
  execFileSync("git", ["checkout", "-b", activity], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), "export {}\n", "utf-8");
  fs.writeFileSync(
    path.join(out, "run-context.json"),
    JSON.stringify(
      {
        execution_context: { allowed_files: ["src/app.js"] },
        git: { enabled: true, status: GIT_BRANCH_READY, activityBranch: activity },
        task: { title: "Execute only task" },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(out, "metadata.json"),
    JSON.stringify({ projectRoot: root, projectId: "p1" }),
    "utf-8",
  );

  assert.ok(!fs.existsSync(path.join(out, "review-output.json")));

  const r = await runPostReviewApprovedGitCommit(
    "run-e",
    out,
    { projectRoot: root },
    { bundle: approvedBundle() },
  );
  assert.ok(fs.existsSync(path.join(out, "review-output.json")));
  assert.strictEqual(r.normalize?.action, "written");
  assert.strictEqual(r.ok, true);
  assert.ok(r.sha);

  const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
  assert.strictEqual(ctx.git.commit.status, GIT_COMMIT_STATUS.COMMITTED);
});

test("execução repetida não duplica commit", async () => {
  const root = tmpRoot("sb-norm-idem-");
  const out = path.join(root, ".setup-boss", "runs", "run-f");
  initGitRepo(root);
  const activity = "setup-boss/idempotent";
  execFileSync("git", ["checkout", "-b", activity], {
    cwd: root,
    stdio: "pipe",
    windowsHide: true,
  });
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), "v1\n", "utf-8");
  fs.writeFileSync(
    path.join(out, "run-context.json"),
    JSON.stringify(
      {
        execution_context: { allowed_files: ["src/app.js"] },
        git: { enabled: true, status: GIT_BRANCH_READY, activityBranch: activity },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(out, "metadata.json"),
    JSON.stringify({ projectRoot: root }),
    "utf-8",
  );

  const bundle = approvedBundle();
  const norm1 = normalizeReviewOutputFromExecutionBundle(out, "run-f", { bundle });
  assert.strictEqual(norm1.action, "written");

  const first = await runPostReviewApprovedGitCommit(
    "run-f",
    out,
    { projectRoot: root },
    { bundle },
  );
  assert.strictEqual(first.ok, true);
  const sha1 = first.sha;

  const norm2 = normalizeReviewOutputFromExecutionBundle(out, "run-f", { bundle });
  assert.strictEqual(norm2.action, "preserved");

  const second = await runPostReviewApprovedGitCommit(
    "run-f",
    out,
    { projectRoot: root },
    { bundle },
  );
  assert.strictEqual(second.skipped, true);
  assert.strictEqual(second.reason, "already_committed");
  assert.strictEqual(second.sha, sha1);
});
