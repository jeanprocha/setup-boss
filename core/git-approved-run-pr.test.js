"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  tryGitPrAfterApprovedPush,
  isGitAutoPrEnabled,
  GIT_PR_ERROR,
  GIT_PR_STATUS,
  persistGitPrState,
} = require("./git-approved-run-pr");
const { GIT_BRANCH_READY, GIT_COMMIT_STATUS } = require("./git-approved-run-commit");
const { GIT_PUSH_STATUS } = require("./git-approved-run-push");
const { parseGitRemoteUrl } = require("./resolve-git-remote-context");

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * @param {string} outputDir
 * @param {{ activity?: string, base?: string, push?: boolean, pr?: Record<string, unknown>|null }} [opts]
 */
function writeGitContext(outputDir, opts = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const activity = opts.activity || "setup-boss/feat";
  const base = opts.base || "main";
  const git = {
    enabled: true,
    status: GIT_BRANCH_READY,
    activityBranch: activity,
    baseBranch: base,
    commit: {
      status: GIT_COMMIT_STATUS.COMMITTED,
      sha: "deadbeef1234",
    },
  };
  if (opts.push !== false) {
    git.push = {
      status: GIT_PUSH_STATUS.PUSHED,
      remote: "origin",
      branch: activity,
      pushedAt: new Date().toISOString(),
    };
  }
  if (opts.pr) git.pr = opts.pr;
  fs.writeFileSync(
    path.join(outputDir, "run-context.json"),
    JSON.stringify({ git, task: { title: "Minha feature" } }, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(outputDir, "metadata.json"),
    JSON.stringify({ projectId: "proj-9" }),
    "utf-8",
  );
}

const bitbucketRemote = {
  ok: true,
  provider: "bitbucket",
  host: "bitbucket.org",
  workspace: "systemwiser",
  repoSlug: "wiser-bot-front",
  originUrl: "git@bitbucket.org:systemwiser/wiser-bot-front.git",
};

const mockDeps = {
  resolveGitRemoteContext: () => bitbucketRemote,
  resolveBitbucketCredentials: () => ({ kind: "basic", username: "u", appPassword: "p" }),
  findOpenBitbucketPullRequest: async () => null,
  createBitbucketPullRequest: async () => ({
    id: "42",
    url: "https://bitbucket.org/systemwiser/wiser-bot-front/pull-requests/42",
  }),
};

test("isGitAutoPrEnabled só com true", () => {
  assert.strictEqual(isGitAutoPrEnabled({ SETUP_BOSS_GIT_AUTO_PR: "true" }), true);
  assert.strictEqual(isGitAutoPrEnabled({ SETUP_BOSS_GIT_AUTO_PR: "false" }), false);
});

test("flag false não cria PR", async () => {
  const out = tmpRoot("sb-pr-off-");
  writeGitContext(out);
  const r = await tryGitPrAfterApprovedPush({
    projectRoot: out,
    outputDir: out,
    runId: "r1",
    env: { SETUP_BOSS_GIT_AUTO_PR: "false" },
    writeReport: false,
    deps: mockDeps,
  });
  assert.strictEqual(r.skipped, true);
  assert.strictEqual(r.code, GIT_PR_ERROR.DISABLED);
});

test("sem push não cria PR", async () => {
  const out = tmpRoot("sb-pr-nopush-");
  writeGitContext(out, { push: false });
  const r = await tryGitPrAfterApprovedPush({
    projectRoot: out,
    outputDir: out,
    runId: "r2",
    env: { SETUP_BOSS_GIT_AUTO_PR: "true" },
    writeReport: false,
    deps: mockDeps,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_PR_ERROR.PUSH_REQUIRED);
});

test("PR já opened não duplica", async () => {
  const out = tmpRoot("sb-pr-open-");
  writeGitContext(out, {
    pr: {
      status: GIT_PR_STATUS.OPENED,
      provider: "bitbucket",
      url: "https://bitbucket.org/x/y/pull-requests/1",
      id: "1",
      sourceBranch: "setup-boss/feat",
      targetBranch: "main",
    },
  });
  const r = await tryGitPrAfterApprovedPush({
    projectRoot: out,
    outputDir: out,
    runId: "r3",
    env: { SETUP_BOSS_GIT_AUTO_PR: "true" },
    writeReport: false,
    deps: {
      ...mockDeps,
      createBitbucketPullRequest: async () => {
        throw new Error("não devia criar");
      },
    },
  });
  assert.strictEqual(r.skipped, true);
  assert.strictEqual(r.reason, "already_opened");
});

test("provider desconhecido falha controlado", async () => {
  const out = tmpRoot("sb-pr-prov-");
  writeGitContext(out);
  const r = await tryGitPrAfterApprovedPush({
    projectRoot: out,
    outputDir: out,
    runId: "r4",
    env: { SETUP_BOSS_GIT_AUTO_PR: "true" },
    writeReport: false,
    deps: {
      ...mockDeps,
      resolveGitRemoteContext: () => ({
        ok: true,
        provider: "github",
        host: "github.com",
        workspace: "org",
        repoSlug: "repo",
      }),
    },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_PR_ERROR.PROVIDER_UNKNOWN);
});

test("credenciais ausentes falham controlado", async () => {
  const out = tmpRoot("sb-pr-cred-");
  writeGitContext(out);
  const r = await tryGitPrAfterApprovedPush({
    projectRoot: out,
    outputDir: out,
    runId: "r5",
    env: { SETUP_BOSS_GIT_AUTO_PR: "true" },
    writeReport: false,
    deps: {
      ...mockDeps,
      resolveBitbucketCredentials: () => null,
    },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_PR_ERROR.CREDENTIALS_MISSING);
});

test("happy path Bitbucket persiste url/id", async () => {
  const out = tmpRoot("sb-pr-ok-");
  writeGitContext(out);
  const r = await tryGitPrAfterApprovedPush({
    projectRoot: out,
    outputDir: out,
    runId: "r6",
    env: { SETUP_BOSS_GIT_AUTO_PR: "true" },
    writeReport: false,
    deps: mockDeps,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.id, "42");
  assert.ok(String(r.url).includes("pull-requests"));

  const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
  assert.strictEqual(ctx.git.pr.status, GIT_PR_STATUS.OPENED);
  assert.strictEqual(ctx.git.pr.id, "42");
});

test("erro da API persiste failed sanitizado", async () => {
  const out = tmpRoot("sb-pr-fail-");
  writeGitContext(out);
  const r = await tryGitPrAfterApprovedPush({
    projectRoot: out,
    outputDir: out,
    runId: "r7",
    env: { SETUP_BOSS_GIT_AUTO_PR: "true" },
    writeReport: false,
    deps: {
      ...mockDeps,
      createBitbucketPullRequest: async () => {
        const e = new Error("Bearer secret-token-xyz falhou");
        throw e;
      },
    },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, GIT_PR_ERROR.FAILED);
  const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
  assert.strictEqual(ctx.git.pr.status, GIT_PR_STATUS.FAILED);
  assert.ok(!String(ctx.git.pr.errorMessage).includes("secret-token"));
});

test("parseGitRemoteUrl Bitbucket SSH", () => {
  const p = parseGitRemoteUrl("git@bitbucket.org:systemwiser/wiser-bot-front.git");
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.provider, "bitbucket");
  assert.strictEqual(p.workspace, "systemwiser");
  assert.strictEqual(p.repoSlug, "wiser-bot-front");
});

test("persistGitPrState grava pr", () => {
  const out = tmpRoot("sb-pr-persist-");
  persistGitPrState(out, {
    status: GIT_PR_STATUS.OPENED,
    id: "9",
    url: "https://example.com/pr/9",
  });
  const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
  assert.strictEqual(ctx.git.pr.id, "9");
});
