"use strict";

const fs = require("fs");
const path = require("path");

const { GIT_BRANCH_READY } = require("./validate-git-execute-gate");
const { GIT_COMMIT_STATUS } = require("./git-approved-run-commit");
const { GIT_PUSH_STATUS } = require("./git-approved-run-push");
const { resolveGitRemoteContext } = require("./resolve-git-remote-context");
const {
  sanitizeBitbucketErrorMessage,
  resolveBitbucketCredentials,
  findOpenBitbucketPullRequest,
  createBitbucketPullRequest,
} = require("./bitbucket-pull-request-api");

const GIT_PR_STATUS = Object.freeze({
  OPENED: "opened",
  FAILED: "failed",
});

const GIT_PR_ERROR = Object.freeze({
  DISABLED: "git_pr_disabled",
  PUSH_REQUIRED: "git_pr_push_required",
  COMMIT_REQUIRED: "git_pr_commit_required",
  BRANCH_REQUIRED: "git_pr_branch_required",
  PROVIDER_UNKNOWN: "git_pr_provider_unknown",
  CREDENTIALS_MISSING: "git_pr_credentials_missing",
  ALREADY_EXISTS: "git_pr_already_exists",
  FAILED: "git_pr_failed",
});

const DOCS_EXECUTIONS_PREFIX = "docs/executions/";

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function isGitAutoPrEnabled(env = process.env) {
  return String(env.SETUP_BOSS_GIT_AUTO_PR || "")
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
 * @param {Record<string, unknown>} prPatch
 */
function persistGitPrState(outputDir, prPatch) {
  const ctxPath = path.join(outputDir, "run-context.json");
  /** @type {Record<string, unknown>} */
  let doc = safeReadJson(ctxPath) || {};
  const prevGit =
    doc.git && typeof doc.git === "object" && !Array.isArray(doc.git)
      ? { .../** @type {Record<string, unknown>} */ (doc.git) }
      : {};
  const prevPr =
    prevGit.pr && typeof prevGit.pr === "object" && !Array.isArray(prevGit.pr)
      ? { .../** @type {Record<string, unknown>} */ (prevGit.pr) }
      : {};
  doc.git = {
    enabled: prevGit.enabled !== false,
    ...prevGit,
    pr: {
      ...prevPr,
      ...prPatch,
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
  doc.updated_at = new Date().toISOString();
  fs.writeFileSync(ctxPath, JSON.stringify(doc, null, 2), "utf-8");
  return /** @type {Record<string, unknown>} */ (doc.git);
}

/**
 * @param {string} outputDir
 * @param {string} runId
 */
function resolveRunTitle(outputDir, runId) {
  const ctx = safeReadJson(path.join(outputDir, "run-context.json"));
  if (ctx && ctx.task && typeof ctx.task === "object" && !Array.isArray(ctx.task)) {
    const t = /** @type {Record<string, unknown>} */ (ctx.task).title;
    if (t != null && String(t).trim()) return String(t).trim();
  }
  const meta = safeReadJson(path.join(outputDir, "metadata.json"));
  if (meta && meta.taskTitle != null && String(meta.taskTitle).trim()) {
    return String(meta.taskTitle).trim();
  }
  return runId;
}

/**
 * @param {string} outputDir
 */
function resolveProjectId(outputDir) {
  const meta = safeReadJson(path.join(outputDir, "metadata.json"));
  if (meta && meta.projectId != null && String(meta.projectId).trim()) {
    return String(meta.projectId).trim();
  }
  const ctx = safeReadJson(path.join(outputDir, "run-context.json"));
  if (ctx && ctx.project_id != null && String(ctx.project_id).trim()) {
    return String(ctx.project_id).trim();
  }
  return "unknown";
}

/**
 * @param {string} runId
 */
function buildExecutionPrReportRelPath(runId) {
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
  return `${DOCS_EXECUTIONS_PREFIX}${stamp}-${slug}-pr-summary.md`;
}

/**
 * @param {{
 *   projectRoot: string,
 *   runId: string,
 *   result: Record<string, unknown>,
 * }} input
 */
function writeExecutionPrReport(input) {
  const rel = buildExecutionPrReportRelPath(input.runId);
  const abs = path.join(path.resolve(input.projectRoot), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const now = new Date().toISOString();
  const lines = [
    `# Resumo — PR automático (Fase 9)`,
    "",
    `**Run:** ${input.runId}`,
    `**Gerado em:** ${now}`,
    "",
    "## Alterações realizadas",
    "",
    `- PR opcional Bitbucket após push (${String(input.result.code || input.result.reason || "ok")}).`,
    "",
    "## Arquivos alterados",
    "",
    "- Estado em `run-context.git.pr` apenas.",
    "",
    "## Decisões técnicas",
    "",
    "- `SETUP_BOSS_GIT_AUTO_PR=true` obrigatório.",
    "- Provider Bitbucket detectado via URL `origin`.",
    "",
    "## Testes executados",
    "",
    "- Ver `core/git-approved-run-pr.test.js`.",
    "",
    "## Riscos",
    "",
    "- Credenciais Bitbucket via env (App Password ou Access Token).",
    "",
    "## Próximos passos",
    "",
    "- Revisar PR no Bitbucket; merge manual.",
    "",
  ];
  fs.writeFileSync(abs, lines.join("\n"), "utf-8");
  return { rel, abs };
}

/**
 * @param {{
 *   runId: string,
 *   title: string,
 *   projectId: string,
 *   commitSha: string,
 * }} input
 */
function buildPullRequestDescription(input) {
  return [
    `Run: ${input.runId}`,
    `Project: ${input.projectId}`,
    "Review: APPROVED",
    `Commit: ${input.commitSha || "unknown"}`,
  ].join("\n");
}

/**
 * @param {{
 *   projectRoot: string,
 *   outputDir: string,
 *   runId: string,
 *   env?: NodeJS.ProcessEnv,
 *   writeReport?: boolean,
 *   deps?: {
 *     resolveGitRemoteContext?: typeof resolveGitRemoteContext,
 *     resolveBitbucketCredentials?: typeof resolveBitbucketCredentials,
 *     findOpenBitbucketPullRequest?: typeof findOpenBitbucketPullRequest,
 *     createBitbucketPullRequest?: typeof createBitbucketPullRequest,
 *   },
 * }} input
 */
async function tryGitPrAfterApprovedPush(input) {
  const projectRoot = path.resolve(String(input.projectRoot || ""));
  const outputDir = path.resolve(String(input.outputDir || ""));
  const runId = String(input.runId || "").trim();
  const env = input.env || process.env;
  const writeReport = input.writeReport !== false;
  const deps = input.deps || {};

  const resolveRemote = deps.resolveGitRemoteContext || resolveGitRemoteContext;
  const resolveCreds = deps.resolveBitbucketCredentials || resolveBitbucketCredentials;
  const findOpenPr = deps.findOpenBitbucketPullRequest || findOpenBitbucketPullRequest;
  const createPr = deps.createBitbucketPullRequest || createBitbucketPullRequest;

  if (!isGitAutoPrEnabled(env)) {
    return { skipped: true, code: GIT_PR_ERROR.DISABLED, reason: "git_pr_disabled" };
  }

  if (!projectRoot || !outputDir || !runId) {
    return { skipped: true, reason: "missing_params" };
  }

  const gitState = readRunGitStateFromOutput(outputDir);
  if (!gitState) {
    persistGitPrState(outputDir, {
      status: GIT_PR_STATUS.FAILED,
      errorCode: GIT_PR_ERROR.PUSH_REQUIRED,
      errorMessage: "run-context.git em falta.",
    });
    return { ok: false, code: GIT_PR_ERROR.PUSH_REQUIRED };
  }

  const push =
    gitState.push && typeof gitState.push === "object" && !Array.isArray(gitState.push)
      ? /** @type {Record<string, unknown>} */ (gitState.push)
      : null;
  if (!push || String(push.status) !== GIT_PUSH_STATUS.PUSHED) {
    persistGitPrState(outputDir, {
      status: GIT_PR_STATUS.FAILED,
      errorCode: GIT_PR_ERROR.PUSH_REQUIRED,
      errorMessage: "PR exige git.push.status === pushed.",
    });
    return { ok: false, code: GIT_PR_ERROR.PUSH_REQUIRED };
  }

  const commit =
    gitState.commit && typeof gitState.commit === "object" && !Array.isArray(gitState.commit)
      ? /** @type {Record<string, unknown>} */ (gitState.commit)
      : null;
  if (!commit || String(commit.status) !== GIT_COMMIT_STATUS.COMMITTED) {
    persistGitPrState(outputDir, {
      status: GIT_PR_STATUS.FAILED,
      errorCode: GIT_PR_ERROR.COMMIT_REQUIRED,
      errorMessage: "PR exige git.commit.status === committed.",
    });
    return { ok: false, code: GIT_PR_ERROR.COMMIT_REQUIRED };
  }

  if (String(gitState.status || "").trim() !== GIT_BRANCH_READY) {
    persistGitPrState(outputDir, {
      status: GIT_PR_STATUS.FAILED,
      errorCode: GIT_PR_ERROR.BRANCH_REQUIRED,
      errorMessage: "PR exige git.status === git_branch_ready.",
    });
    return { ok: false, code: GIT_PR_ERROR.BRANCH_REQUIRED };
  }

  const activityBranch =
    gitState.activityBranch != null ? String(gitState.activityBranch).trim() : "";
  const baseBranch =
    gitState.baseBranch != null ? String(gitState.baseBranch).trim() : "";
  if (!activityBranch || !baseBranch) {
    persistGitPrState(outputDir, {
      status: GIT_PR_STATUS.FAILED,
      errorCode: GIT_PR_ERROR.BRANCH_REQUIRED,
      errorMessage: "activityBranch e baseBranch são obrigatórios.",
    });
    return { ok: false, code: GIT_PR_ERROR.BRANCH_REQUIRED };
  }

  const existingPr =
    gitState.pr && typeof gitState.pr === "object" && !Array.isArray(gitState.pr)
      ? /** @type {Record<string, unknown>} */ (gitState.pr)
      : null;
  if (
    existingPr &&
    String(existingPr.status) === GIT_PR_STATUS.OPENED &&
    String(existingPr.sourceBranch || "") === activityBranch &&
    String(existingPr.targetBranch || "") === baseBranch
  ) {
    return {
      skipped: true,
      reason: "already_opened",
      url: existingPr.url != null ? String(existingPr.url) : "",
      id: existingPr.id != null ? String(existingPr.id) : "",
    };
  }

  const remoteCtx = resolveRemote(projectRoot, "origin");
  if (!remoteCtx.ok) {
    persistGitPrState(outputDir, {
      status: GIT_PR_STATUS.FAILED,
      errorCode: GIT_PR_ERROR.PROVIDER_UNKNOWN,
      errorMessage: "Não foi possível resolver o remote origin.",
    });
    return { ok: false, code: GIT_PR_ERROR.PROVIDER_UNKNOWN };
  }

  if (remoteCtx.provider !== "bitbucket") {
    persistGitPrState(outputDir, {
      status: GIT_PR_STATUS.FAILED,
      errorCode: GIT_PR_ERROR.PROVIDER_UNKNOWN,
      errorMessage: `Provider '${remoteCtx.provider}' não suportado para PR automático (MVP: bitbucket).`,
    });
    return { ok: false, code: GIT_PR_ERROR.PROVIDER_UNKNOWN };
  }

  const auth = resolveCreds(env);
  if (!auth) {
    persistGitPrState(outputDir, {
      status: GIT_PR_STATUS.FAILED,
      errorCode: GIT_PR_ERROR.CREDENTIALS_MISSING,
      errorMessage:
        "Credenciais Bitbucket em falta (SETUP_BOSS_BITBUCKET_USERNAME/APP_PASSWORD ou ACCESS_TOKEN).",
    });
    return { ok: false, code: GIT_PR_ERROR.CREDENTIALS_MISSING };
  }

  const prParams = {
    workspace: remoteCtx.workspace,
    repoSlug: remoteCtx.repoSlug,
    sourceBranch: activityBranch,
    destinationBranch: baseBranch,
    auth,
  };

  try {
    const existingRemote = await findOpenPr(prParams);
    if (existingRemote && existingRemote.id) {
      const openedAt = new Date().toISOString();
      persistGitPrState(outputDir, {
        status: GIT_PR_STATUS.OPENED,
        provider: "bitbucket",
        url: existingRemote.url || "",
        id: existingRemote.id,
        sourceBranch: activityBranch,
        targetBranch: baseBranch,
        openedAt,
        discoveredExisting: true,
      });
      return {
        skipped: true,
        code: GIT_PR_ERROR.ALREADY_EXISTS,
        reason: "already_exists_remote",
        id: existingRemote.id,
        url: existingRemote.url,
      };
    }

    const title = `setup-boss: ${resolveRunTitle(outputDir, runId)}`.slice(0, 200);
    const description = buildPullRequestDescription({
      runId,
      title,
      projectId: resolveProjectId(outputDir),
      commitSha: commit.sha != null ? String(commit.sha) : "",
    });

    const created = await createPr({
      ...prParams,
      title,
      description,
    });

    const openedAt = new Date().toISOString();
    persistGitPrState(outputDir, {
      status: GIT_PR_STATUS.OPENED,
      provider: "bitbucket",
      url: created.url || "",
      id: created.id || "",
      sourceBranch: activityBranch,
      targetBranch: baseBranch,
      openedAt,
    });

    const result = {
      ok: true,
      provider: "bitbucket",
      id: created.id,
      url: created.url,
      sourceBranch: activityBranch,
      targetBranch: baseBranch,
    };

    if (writeReport) {
      writeExecutionPrReport({ projectRoot, runId, result });
    }

    return result;
  } catch (err) {
    const message = sanitizeBitbucketErrorMessage(
      err && err.message ? String(err.message) : "Falha ao criar PR no Bitbucket.",
    );
    persistGitPrState(outputDir, {
      status: GIT_PR_STATUS.FAILED,
      errorCode: GIT_PR_ERROR.FAILED,
      errorMessage: message,
    });
    const failResult = { ok: false, code: GIT_PR_ERROR.FAILED };
    if (writeReport) {
      writeExecutionPrReport({ projectRoot, runId, result: failResult });
    }
    return failResult;
  }
}

module.exports = {
  GIT_PR_STATUS,
  GIT_PR_ERROR,
  isGitAutoPrEnabled,
  persistGitPrState,
  buildPullRequestDescription,
  buildExecutionPrReportRelPath,
  writeExecutionPrReport,
  tryGitPrAfterApprovedPush,
};
