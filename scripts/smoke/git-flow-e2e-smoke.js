#!/usr/bin/env node
/**
 * Smoke E2E local — fluxo Git completo (Fase 10).
 *
 * Valida: prepare branch → execute gate → review approved → commit → push/PR opcionais.
 * Sem rede por omissão; push usa remote bare local; PR usa mocks Bitbucket.
 *
 * Uso:
 *   node scripts/smoke/git-flow-e2e-smoke.js
 *   npm run smoke:git-flow-e2e
 *
 * Opcional (offline com bare local):
 *   SETUP_BOSS_GIT_AUTO_PUSH=true node scripts/smoke/git-flow-e2e-smoke.js
 *   SETUP_BOSS_GIT_AUTO_PUSH=true SETUP_BOSS_GIT_AUTO_PR=true node scripts/smoke/git-flow-e2e-smoke.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "../..");
const REPORT_PATH = path.join(
  REPO_ROOT,
  "docs",
  "reports",
  "2026-05-16-git-flow-e2e-smoke-phase10.md",
);

const { writeRunIndex, resolveRunIndexPath } = require("../../core/run-resolver");
const { getCurrentBranch, getHeadCommit } = require("../../core/git-exec");
const { validateGitExecuteGate, GIT_BRANCH_READY } = require("../../core/validate-git-execute-gate");
const {
  prepareRunGitBranch,
  readRunGitState,
  GIT_BRANCH_STATUS,
} = require("../daemon/lib/run-git-branch-api");
const { validateExecuteReadiness } = require("../daemon/lib/run-execute-api");
const { buildApprovalState } = require("../runtime/clarification/approval");
const {
  tryGitCommitAfterApprovedRun,
  GIT_COMMIT_STATUS,
} = require("../../core/git-approved-run-commit");
const {
  tryGitPushAfterApprovedCommit,
  GIT_PUSH_ERROR,
  GIT_PUSH_STATUS,
} = require("../../core/git-approved-run-push");
const {
  tryGitPrAfterApprovedPush,
  GIT_PR_ERROR,
  GIT_PR_STATUS,
} = require("../../core/git-approved-run-pr");

/** @type {Record<string, "ok"|"skip"|"fail">} */
const results = {};

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmrf(dir) {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }).trim();
}

function initGitRepo(root) {
  git(root, ["init"]);
  git(root, ["config", "user.email", "smoke@setup-boss.local"]);
  git(root, ["config", "user.name", "Setup Boss Smoke"]);
  fs.writeFileSync(path.join(root, "README.md"), "# smoke\n", "utf-8");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  git(root, ["branch", "-M", "main"]);
}

/**
 * @param {string} workRoot
 * @returns {{ projectRoot: string, bareRemotePath: string }}
 */
function setupProject(workRoot) {
  const projectRoot = path.join(workRoot, "project");
  fs.mkdirSync(projectRoot, { recursive: true });
  initGitRepo(projectRoot);

  const bareRemotePath = path.join(workRoot, "remote.git");
  fs.mkdirSync(bareRemotePath, { recursive: true });
  git(bareRemotePath, ["init", "--bare"]);
  return { projectRoot, bareRemotePath };
}

/**
 * Remote só após prepare — evita pull em bare vazio durante prepareRunGitBranch.
 *
 * @param {string} projectRoot
 * @param {string} bareRemotePath
 */
function attachBareOrigin(projectRoot, bareRemotePath) {
  try {
    git(projectRoot, ["remote", "get-url", "origin"]);
  } catch {
    git(projectRoot, ["remote", "add", "origin", bareRemotePath]);
  }
  git(projectRoot, ["push", "origin", "refs/heads/main:refs/heads/main"]);
}

/**
 * @param {string} projectRoot
 * @param {string} outputDir
 * @param {string} runId
 */
function seedStrategyReadyRun(projectRoot, outputDir, runId) {
  fs.mkdirSync(outputDir, { recursive: true });
  writeRunIndex({
    runId,
    projectRoot,
    outputDir,
    run_type: "smoke",
  });

  const planRef = "task-plan-refined.md";
  fs.writeFileSync(path.join(outputDir, planRef), "# Plano smoke\n\nOK\n", "utf-8");
  const approval = buildApprovalState({
    decision: "approved",
    planRef,
    planSha256: "smoke-sha",
  });
  fs.writeFileSync(
    path.join(outputDir, "approval-state.json"),
    JSON.stringify(approval, null, 2),
    "utf-8",
  );

  const strategyDir = path.join(outputDir, "strategy");
  fs.mkdirSync(strategyDir, { recursive: true });
  fs.writeFileSync(
    path.join(strategyDir, "strategy-readiness.json"),
    JSON.stringify({ schema_version: "1.0.0", status: "strategy_ready" }, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(strategyDir, "execution-ready-handoff.json"),
    JSON.stringify({ status: "execution_ready_handoff_completed" }, null, 2),
    "utf-8",
  );

  fs.writeFileSync(
    path.join(outputDir, "run-context.json"),
    JSON.stringify(
      {
        run_id: runId,
        phase2: { schema_version: "1.0.0", status: "ready_for_execution" },
        phase3: { schema_version: "1.0.0", status: "strategy_ready" },
        task: { title: "Smoke Git Flow E2E" },
        execution_context: { allowed_files: ["src/feature.js"] },
        git: { enabled: true },
      },
      null,
      2,
    ),
    "utf-8",
  );

  fs.writeFileSync(
    path.join(outputDir, "metadata.json"),
    JSON.stringify({ projectId: "smoke-git-flow", projectRoot }, null, 2),
    "utf-8",
  );
}

async function step(name, fn) {
  process.stdout.write(`[smoke] ${name}... `);
  try {
    await fn();
    results[name] = "ok";
    console.log("OK");
  } catch (err) {
    results[name] = "fail";
    console.log("FAIL");
    throw err;
  }
}

function stepSkip(name, reason) {
  results[name] = "skip";
  console.log(`[smoke] ${name}... SKIP (${reason})`);
}

function appendReport(extraLines) {
  const stamp = new Date().toISOString();
  const block = [
    "",
    `## Execução ${stamp}`,
    "",
    "| Etapa | Resultado |",
    "|-------|-----------|",
    ...Object.entries(results).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    ...extraLines,
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const prev = fs.existsSync(REPORT_PATH) ? fs.readFileSync(REPORT_PATH, "utf-8") : "";
  if (!prev.includes("# Fase 10")) {
    fs.writeFileSync(
      REPORT_PATH,
      [
        "# Fase 10 — Smoke E2E fluxo Git completo",
        "",
        "**Data:** 2026-05-16",
        "",
        "Registo append-only de execuções do smoke `scripts/smoke/git-flow-e2e-smoke.js`.",
        "",
      ].join("\n"),
      "utf-8",
    );
  }
  fs.appendFileSync(REPORT_PATH, block, "utf-8");
}

const mockPrDeps = {
  resolveGitRemoteContext: () => ({
    ok: true,
    provider: "bitbucket",
    host: "bitbucket.org",
    workspace: "smoke-ws",
    repoSlug: "smoke-repo",
    originUrl: "git@bitbucket.org:smoke-ws/smoke-repo.git",
  }),
  resolveBitbucketCredentials: () => ({ kind: "basic", username: "smoke", appPassword: "fake" }),
  findOpenBitbucketPullRequest: async () => null,
  createBitbucketPullRequest: async () => ({
    id: "99",
    url: "https://bitbucket.org/smoke-ws/smoke-repo/pull-requests/99",
  }),
};

async function main() {
  const env = { ...process.env };
  const pushEnabled = String(env.SETUP_BOSS_GIT_AUTO_PUSH || "").toLowerCase() === "true";
  const prEnabled = String(env.SETUP_BOSS_GIT_AUTO_PR || "").toLowerCase() === "true";

  const workRoot = tmp("sb-git-flow-e2e-");
  const runId = `20260516-${String(Date.now()).slice(-6)}-git-flow-e2e-smoke`;
  const indexPath = resolveRunIndexPath(runId);
  let projectRoot = "";
  let outputDir = "";
  const activityBranch = "setup-boss/20260516-git-flow-e2e";

  const daemonInput = {
    runId,
    outputDir: "",
    jobs: [],
    daemonSnapshot: { running: true },
  };

  try {
    const setup = setupProject(workRoot);
    projectRoot = setup.projectRoot;
    const bareRemotePath = setup.bareRemotePath;
    outputDir = path.join(projectRoot, "docs", ".IA", "outputs", runId);
    daemonInput.outputDir = outputDir;

    seedStrategyReadyRun(projectRoot, outputDir, runId);

    const mainHeadBefore = getHeadCommit(projectRoot);
    assert.strictEqual(getCurrentBranch(projectRoot), "main");

    await step("execute gate bloqueia em main sem branch preparada", () => {
      const gate = validateGitExecuteGate({
        projectRoot,
        gitState: readRunGitState(outputDir),
      });
      assert.strictEqual(gate.ok, false);
      assert.strictEqual(gate.code, "git_branch_required");

      const readiness = validateExecuteReadiness(daemonInput);
      assert.strictEqual(readiness.ok, false);
      assert.strictEqual(readiness.code, "git_branch_required");
    });

    await step("prepare branch cria activityBranch", async () => {
      const r = await prepareRunGitBranch({ runId, activityBranch });
      assert.strictEqual(r.ok, true, r.message || JSON.stringify(r));
      const git = readRunGitState(outputDir);
      assert.strictEqual(git?.status, GIT_BRANCH_STATUS.READY);
      assert.strictEqual(git?.activityBranch, activityBranch);
      assert.ok(git?.baseBranch);
      assert.strictEqual(getCurrentBranch(projectRoot), activityBranch);
    });

    await step("execute gate permite após prepare", () => {
      const gitState = readRunGitState(outputDir);
      assert.strictEqual(gitState?.status, GIT_BRANCH_READY);
      const gate = validateGitExecuteGate({ projectRoot, gitState });
      assert.strictEqual(gate.ok, true);
      const readiness = validateExecuteReadiness(daemonInput);
      assert.strictEqual(readiness.ok, true, readiness.message);
    });

    await step("review approved + commit gera SHA", async () => {
      fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(projectRoot, "src", "feature.js"), "export const x = 1;\n", "utf-8");
      fs.writeFileSync(
        path.join(outputDir, "review-output.json"),
        JSON.stringify({ status: "approved" }, null, 2),
        "utf-8",
      );

      const commitResult = await tryGitCommitAfterApprovedRun({
        projectRoot,
        outputDir,
        runId,
        writeReport: false,
      });
      assert.strictEqual(commitResult.ok, true, JSON.stringify(commitResult));
      assert.ok(commitResult.sha && /^[0-9a-f]{7,40}$/i.test(String(commitResult.sha)));

      const ctx = JSON.parse(fs.readFileSync(path.join(outputDir, "run-context.json"), "utf-8"));
      assert.strictEqual(ctx.git.status, GIT_BRANCH_READY);
      assert.strictEqual(ctx.git.commit.status, GIT_COMMIT_STATUS.COMMITTED);
      assert.strictEqual(ctx.git.commit.sha, commitResult.sha);
      assert.strictEqual(getCurrentBranch(projectRoot), activityBranch);
    });

    await step("branch protegida main não recebeu commit direto", () => {
      const mainHeadAfter = git(projectRoot, ["rev-parse", "main"]);
      assert.strictEqual(mainHeadAfter, mainHeadBefore);
      assert.strictEqual(getCurrentBranch(projectRoot), activityBranch);
    });

    const pushEnv = { ...env, SETUP_BOSS_GIT_AUTO_PUSH: pushEnabled ? "true" : "false" };
    if (!pushEnabled) {
      await step("push skipped com flag off", () => {
        const r = tryGitPushAfterApprovedCommit({
          projectRoot,
          outputDir,
          runId,
          env: pushEnv,
          writeReport: false,
        });
        assert.strictEqual(r.skipped, true);
        assert.strictEqual(r.code, GIT_PUSH_ERROR.DISABLED);
        const git = readRunGitState(outputDir);
        assert.ok(!git?.push || String(git.push.status || "") !== GIT_PUSH_STATUS.PUSHED);
      });
    } else {
      await step("push para bare local com flag on", () => {
        attachBareOrigin(projectRoot, bareRemotePath);
        const r = tryGitPushAfterApprovedCommit({
          projectRoot,
          outputDir,
          runId,
          env: pushEnv,
          writeReport: false,
        });
        assert.strictEqual(r.ok, true, JSON.stringify(r));
        const git = readRunGitState(outputDir);
        assert.strictEqual(git?.push?.status, GIT_PUSH_STATUS.PUSHED);
        assert.strictEqual(git?.push?.branch, activityBranch);
      });
    }

    const prEnv = {
      ...pushEnv,
      SETUP_BOSS_GIT_AUTO_PR: prEnabled ? "true" : "false",
    };
    if (!prEnabled) {
      await step("PR skipped com flag off", async () => {
        const r = await tryGitPrAfterApprovedPush({
          projectRoot,
          outputDir,
          runId,
          env: prEnv,
          writeReport: false,
          deps: mockPrDeps,
        });
        assert.strictEqual(r.skipped, true);
        assert.strictEqual(r.code, GIT_PR_ERROR.DISABLED);
      });
    } else if (!pushEnabled) {
      stepSkip("PR com flag on", "requer SETUP_BOSS_GIT_AUTO_PUSH=true");
    } else {
      await step("PR via mock Bitbucket com flag on", async () => {
        const r = await tryGitPrAfterApprovedPush({
          projectRoot,
          outputDir,
          runId,
          env: prEnv,
          writeReport: false,
          deps: mockPrDeps,
        });
        assert.strictEqual(r.ok, true, JSON.stringify(r));
        const git = readRunGitState(outputDir);
        assert.strictEqual(git?.pr?.status, GIT_PR_STATUS.OPENED);
        assert.ok(String(git?.pr?.url || "").includes("pull-requests"));
      });
    }

    appendReport([
      `- **runId:** \`${runId}\``,
      `- **push:** ${pushEnabled ? "habilitado" : "desligado"}`,
      `- **PR:** ${prEnabled ? "habilitado (mock)" : "desligado"}`,
      `- **Resultado:** sucesso`,
    ]);

    console.log("\nsmoke:git-flow-e2e OK");
  } catch (err) {
    appendReport([
      `- **runId:** \`${runId}\``,
      `- **push:** ${pushEnabled}`,
      `- **PR:** ${prEnabled}`,
      `- **Resultado:** falha`,
      `- **Erro:** ${err && err.message ? err.message : String(err)}`,
    ]);
    console.error("\nsmoke:git-flow-e2e FAIL");
    throw err;
  } finally {
    if (fs.existsSync(indexPath)) {
      fs.unlinkSync(indexPath);
    }
    rmrf(workRoot);
  }
}

main().catch((err) => {
  process.exitCode = 1;
  if (err && err.stack) console.error(err.stack);
});
