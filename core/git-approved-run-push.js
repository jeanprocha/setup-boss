"use strict";

const fs = require("fs");
const path = require("path");

const { GIT_BRANCH_READY, isProtectedBranch } = require("./validate-git-execute-gate");
const {
  getCurrentBranch,
  gitExecInRepoSync,
  isGitRepository,
  hasGitRemote,
} = require("./git-exec");
const { GIT_COMMIT_STATUS } = require("./git-approved-run-commit");

const GIT_PUSH_STATUS = Object.freeze({
  PUSHED: "pushed",
  FAILED: "failed",
});

const GIT_PUSH_ERROR = Object.freeze({
  DISABLED: "git_push_disabled",
  COMMIT_REQUIRED: "git_push_commit_required",
  BRANCH_MISMATCH: "git_push_branch_mismatch",
  BRANCH_REQUIRED: "git_push_branch_required",
  PROTECTED_BRANCH: "git_push_protected_branch",
  NO_REMOTE: "git_push_no_remote",
  FAILED: "git_push_failed",
});

const DEFAULT_REMOTE = "origin";
const DOCS_EXECUTIONS_PREFIX = "docs/executions/";

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function isGitAutoPushEnabled(env = process.env) {
  return String(env.SETUP_BOSS_GIT_AUTO_PUSH || "")
    .trim()
    .toLowerCase() === "true";
}

/**
 * @param {string} fp
 * @returns {Record<string, unknown>|null}
 */
function safeReadJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @returns {Record<string, unknown>|null}
 */
function readRunGitStateFromOutput(outputDir) {
  const ctx = safeReadJson(path.join(outputDir, "run-context.json"));
  if (!ctx || !ctx.git || typeof ctx.git !== "object" || Array.isArray(ctx.git)) {
    return null;
  }
  return /** @type {Record<string, unknown>} */ (ctx.git);
}

/**
 * @param {string} outputDir
 * @param {Record<string, unknown>} pushPatch
 */
function persistGitPushState(outputDir, pushPatch) {
  const ctxPath = path.join(outputDir, "run-context.json");
  /** @type {Record<string, unknown>} */
  let doc = safeReadJson(ctxPath) || {};
  const prevGit =
    doc.git && typeof doc.git === "object" && !Array.isArray(doc.git)
      ? { .../** @type {Record<string, unknown>} */ (doc.git) }
      : {};
  const prevPush =
    prevGit.push && typeof prevGit.push === "object" && !Array.isArray(prevGit.push)
      ? { .../** @type {Record<string, unknown>} */ (prevGit.push) }
      : {};
  doc.git = {
    enabled: prevGit.enabled !== false,
    ...prevGit,
    push: {
      ...prevPush,
      ...pushPatch,
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
  doc.updated_at = new Date().toISOString();
  fs.writeFileSync(ctxPath, JSON.stringify(doc, null, 2), "utf-8");
  return /** @type {Record<string, unknown>} */ (doc.git);
}

/**
 * @param {unknown} msg
 */
function sanitizeGitPushErrorMessage(msg) {
  return String(msg || "")
    .replace(/https?:\/\/[^\s]+/gi, "<remote-url-redacted>")
    .replace(/git@[^\s:]+:[^\s]+/gi, "<remote-url-redacted>")
    .replace(/\S+@\S+/g, "<credential-redacted>")
    .slice(0, 500);
}

/**
 * @param {string} projectRoot
 * @param {string} branchName
 */
function branchHasUpstream(projectRoot, branchName) {
  const branch = String(branchName || "").trim();
  if (!branch) return false;
  try {
    const out = gitExecInRepoSync(
      projectRoot,
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", `${branch}@{upstream}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return Boolean(String(out).trim());
  } catch {
    return false;
  }
}

/**
 * @param {string} projectRoot
 * @param {string} activityBranch
 * @param {string} [remoteName]
 */
function pushActivityBranchToOrigin(projectRoot, activityBranch, remoteName = DEFAULT_REMOTE) {
  const root = path.resolve(projectRoot);
  const branch = String(activityBranch || "").trim();
  const remote = String(remoteName || DEFAULT_REMOTE).trim() || DEFAULT_REMOTE;
  if (!branch) {
    const e = new Error("activityBranch é obrigatória para push.");
    e.code = GIT_PUSH_ERROR.BRANCH_REQUIRED;
    throw e;
  }

  const setUpstream = !branchHasUpstream(root, branch);
  const args = setUpstream
    ? ["push", "-u", remote, branch]
    : ["push", remote, branch];

  gitExecInRepoSync(root, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return { remote, branch, setUpstream };
}

/**
 * @param {string} runId
 */
function buildExecutionPushReportRelPath(runId) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .slice(0, 15);
  const slug = String(runId || "run")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${DOCS_EXECUTIONS_PREFIX}${stamp}-${slug}-push-summary.md`;
}

/**
 * @param {{
 *   projectRoot: string,
 *   runId: string,
 *   activityBranch: string,
 *   remote: string,
 *   result: Record<string, unknown>,
 * }} input
 */
function writeExecutionPushReport(input) {
  const rel = buildExecutionPushReportRelPath(input.runId);
  const abs = path.join(path.resolve(input.projectRoot), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const now = new Date().toISOString();
  const lines = [
    `# Resumo — push automático (Fase 8)`,
    "",
    `**Run:** ${input.runId}`,
    `**Gerado em:** ${now}`,
    "",
    "## Alterações realizadas",
    "",
    `- Push opcional para \`${input.remote}/${input.activityBranch}\`.`,
    `- Resultado: ${String(input.result.ok === true ? "pushed" : input.result.code || input.result.reason || "unknown")}.`,
    "",
    "## Arquivos alterados",
    "",
    "- Nenhum ficheiro de código (operação Git remota apenas).",
    "- Estado persistido em `run-context.git.push`.",
    "",
    "## Decisões técnicas",
    "",
    "- Activado apenas com `SETUP_BOSS_GIT_AUTO_PUSH=true`.",
    "- Sem force push; upstream `-u` na primeira vez.",
    "",
    "## Testes executados",
    "",
    "- Ver `core/git-approved-run-push.test.js`.",
    "",
    "## Riscos",
    "",
    "- Push depende de `origin` configurado e credenciais locais.",
    "- URLs/credenciais não são logadas em caso de erro.",
    "",
    "## Próximos passos",
    "",
    "- Abrir PR manualmente ou fase futura de PR automático.",
    "",
  ];

  fs.writeFileSync(abs, lines.join("\n"), "utf-8");
  return { rel, abs };
}

/**
 * @param {{
 *   projectRoot: string,
 *   outputDir: string,
 *   runId: string,
 *   env?: NodeJS.ProcessEnv,
 *   writeReport?: boolean,
 * }} input
 */
function tryGitPushAfterApprovedCommit(input) {
  const projectRoot = path.resolve(String(input.projectRoot || ""));
  const outputDir = path.resolve(String(input.outputDir || ""));
  const runId = String(input.runId || "").trim();
  const env = input.env || process.env;
  const writeReport = input.writeReport !== false;

  if (!isGitAutoPushEnabled(env)) {
    return { skipped: true, code: GIT_PUSH_ERROR.DISABLED, reason: "git_push_disabled" };
  }

  if (!projectRoot || !outputDir || !runId) {
    return { skipped: true, reason: "missing_params" };
  }

  if (!isGitRepository(projectRoot)) {
    return { skipped: true, reason: "not_git_repository" };
  }

  const gitState = readRunGitStateFromOutput(outputDir);
  if (!gitState) {
    persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.FAILED,
      errorCode: GIT_PUSH_ERROR.COMMIT_REQUIRED,
      errorMessage: "run-context.git em falta.",
    });
    return { ok: false, code: GIT_PUSH_ERROR.COMMIT_REQUIRED };
  }

  const commit =
    gitState.commit && typeof gitState.commit === "object" && !Array.isArray(gitState.commit)
      ? /** @type {Record<string, unknown>} */ (gitState.commit)
      : null;
  if (!commit || String(commit.status) !== GIT_COMMIT_STATUS.COMMITTED) {
    persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.FAILED,
      errorCode: GIT_PUSH_ERROR.COMMIT_REQUIRED,
      errorMessage: "Push exige git.commit.status === committed.",
    });
    return { ok: false, code: GIT_PUSH_ERROR.COMMIT_REQUIRED };
  }

  const gitStatus = gitState.status != null ? String(gitState.status).trim() : "";
  if (gitStatus !== GIT_BRANCH_READY) {
    persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.FAILED,
      errorCode: GIT_PUSH_ERROR.BRANCH_REQUIRED,
      errorMessage: "Push exige git.status === git_branch_ready.",
    });
    return { ok: false, code: GIT_PUSH_ERROR.BRANCH_REQUIRED };
  }

  const activityBranch =
    gitState.activityBranch != null ? String(gitState.activityBranch).trim() : "";
  if (!activityBranch) {
    persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.FAILED,
      errorCode: GIT_PUSH_ERROR.BRANCH_REQUIRED,
      errorMessage: "activityBranch em falta.",
    });
    return { ok: false, code: GIT_PUSH_ERROR.BRANCH_REQUIRED };
  }

  const existingPush =
    gitState.push && typeof gitState.push === "object" && !Array.isArray(gitState.push)
      ? /** @type {Record<string, unknown>} */ (gitState.push)
      : null;
  if (
    existingPush &&
    String(existingPush.status) === GIT_PUSH_STATUS.PUSHED &&
    String(existingPush.branch || "") === activityBranch &&
    String(existingPush.remote || DEFAULT_REMOTE) === DEFAULT_REMOTE
  ) {
    return {
      skipped: true,
      reason: "already_pushed",
      branch: activityBranch,
      remote: DEFAULT_REMOTE,
    };
  }

  let currentBranch = null;
  try {
    currentBranch = getCurrentBranch(projectRoot);
  } catch (err) {
    const message = sanitizeGitPushErrorMessage(
      err && err.message ? String(err.message) : "Falha ao ler branch.",
    );
    persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.FAILED,
      errorCode: GIT_PUSH_ERROR.FAILED,
      errorMessage: message,
    });
    return { ok: false, code: GIT_PUSH_ERROR.FAILED };
  }

  if (!currentBranch || currentBranch !== activityBranch) {
    persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.FAILED,
      errorCode: GIT_PUSH_ERROR.BRANCH_MISMATCH,
      errorMessage: `HEAD (${currentBranch || "?"}) ≠ activityBranch (${activityBranch}).`,
    });
    return { ok: false, code: GIT_PUSH_ERROR.BRANCH_MISMATCH };
  }

  if (isProtectedBranch(currentBranch)) {
    persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.FAILED,
      errorCode: GIT_PUSH_ERROR.PROTECTED_BRANCH,
      errorMessage: `Push bloqueado em branch protegida (${currentBranch}).`,
    });
    return { ok: false, code: GIT_PUSH_ERROR.PROTECTED_BRANCH };
  }

  if (!hasGitRemote(projectRoot, DEFAULT_REMOTE)) {
    persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.FAILED,
      errorCode: GIT_PUSH_ERROR.NO_REMOTE,
      errorMessage: `Remote '${DEFAULT_REMOTE}' não configurado.`,
    });
    return { ok: false, code: GIT_PUSH_ERROR.NO_REMOTE };
  }

  /** @type {Record<string, unknown>} */
  let pushAttemptResult = { ok: false, code: GIT_PUSH_ERROR.FAILED };

  try {
    const pushMeta = pushActivityBranchToOrigin(projectRoot, activityBranch, DEFAULT_REMOTE);
    const pushedAt = new Date().toISOString();
    persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.PUSHED,
      remote: pushMeta.remote,
      branch: pushMeta.branch,
      pushedAt,
      setUpstream: pushMeta.setUpstream,
    });
    pushAttemptResult = {
      ok: true,
      remote: pushMeta.remote,
      branch: pushMeta.branch,
      pushedAt,
      setUpstream: pushMeta.setUpstream,
    };
  } catch (err) {
    const message = sanitizeGitPushErrorMessage(
      err && err.message ? String(err.message) : "git push falhou.",
    );
    persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.FAILED,
      errorCode: GIT_PUSH_ERROR.FAILED,
      errorMessage: message,
    });
    pushAttemptResult = { ok: false, code: GIT_PUSH_ERROR.FAILED };
    if (writeReport) {
      writeExecutionPushReport({
        projectRoot,
        runId,
        activityBranch,
        remote: DEFAULT_REMOTE,
        result: pushAttemptResult,
      });
    }
    return pushAttemptResult;
  }

  if (writeReport) {
    writeExecutionPushReport({
      projectRoot,
      runId,
      activityBranch,
      remote: DEFAULT_REMOTE,
      result: pushAttemptResult,
    });
  }

  return pushAttemptResult;
}

module.exports = {
  GIT_PUSH_STATUS,
  GIT_PUSH_ERROR,
  DEFAULT_REMOTE,
  isGitAutoPushEnabled,
  persistGitPushState,
  sanitizeGitPushErrorMessage,
  branchHasUpstream,
  pushActivityBranchToOrigin,
  buildExecutionPushReportRelPath,
  writeExecutionPushReport,
  tryGitPushAfterApprovedCommit,
};
