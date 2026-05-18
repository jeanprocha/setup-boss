"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { mapRunGitForUi, sanitizeGitUserMessage } = require("./map-run-git-for-ui");

test("mapRunGitForUi preenche branchHint com activityBranch quando ready", () => {
  const r = mapRunGitForUi({
    status: "git_branch_ready",
    activityBranch: "setup-boss/20260516-exemplo",
  });
  assert.strictEqual(r.branchHint, "setup-boss/20260516-exemplo");
  assert.strictEqual(r.git?.status, "git_branch_ready");
  assert.strictEqual(r.git?.activityBranch, "setup-boss/20260516-exemplo");
});

test("mapRunGitForUi run antigo sem git retorna null", () => {
  const r = mapRunGitForUi(null);
  assert.strictEqual(r.branchHint, null);
  assert.strictEqual(r.git, null);
});

test("mapRunGitForUi git_branch_failed expõe errorCode seguro", () => {
  const r = mapRunGitForUi({
    status: "git_branch_failed",
    errorCode: "git_pull_failed",
    errorMessage: "git pull --ff-only falhou.\n    at foo (bar.js:1:1)",
  });
  assert.strictEqual(r.branchHint, null);
  assert.strictEqual(r.git?.status, "git_branch_failed");
  assert.strictEqual(r.git?.errorCode, "git_pull_failed");
  assert.strictEqual(r.git?.errorMessage, "git pull --ff-only falhou.");
  assert.strictEqual(r.git?.errorMessage?.includes("at foo"), false);
});

test("mapRunGitForUi propaga executeBlockCode", () => {
  const r = mapRunGitForUi(
    { status: "git_branch_pending" },
    { executeBlockCode: "git_branch_required" },
  );
  assert.strictEqual(r.git?.executeBlockCode, "git_branch_required");
});

test("sanitizeGitUserMessage remove stack-like lines", () => {
  assert.strictEqual(
    sanitizeGitUserMessage("ok\n    at fn (file.js:2:3)"),
    "ok",
  );
});
