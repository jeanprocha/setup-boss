"use strict";

const path = require("path");

const { resolveOutputDir } = require("../../../core/run-resolver");
const { GIT_BRANCH_READY, isProtectedBranch } = require("../../../core/validate-git-execute-gate");
const {
  getCurrentBranch,
  isGitRepository,
  hasGitRemote,
  gitExecInRepoSync,
} = require("../../../core/git-exec");
const {
  tryGitPushAfterApprovedCommit,
  pushActivityBranchToOrigin,
  persistGitPushState,
  GIT_PUSH_STATUS,
  GIT_PUSH_ERROR,
  DEFAULT_REMOTE,
  sanitizeGitPushErrorMessage,
} = require("../../../core/git-approved-run-push");
const {
  readRunGitState,
  resolveProjectRootForRun,
} = require("./run-git-branch-api");
const { emitRuntimeEvent } = require("./runtime-events");

/**
 * @param {string} projectRoot
 * @param {string} remote
 * @returns {string|null}
 */
function resolveRemoteDisplayUrl(projectRoot, remote = DEFAULT_REMOTE) {
  try {
    const url = gitExecInRepoSync(
      projectRoot,
      ["config", "--get", `remote.${remote}.url`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const t = String(url || "").trim();
    return t || null;
  } catch {
    return null;
  }
}

/**
 * Push explícito (confirmação humana) — não exige commit se branch estiver pronta.
 *
 * @param {{ runId: string, jobId?: string|null, projectId?: string|null }} input
 */
async function pushRunGitBranch(input) {
  const runId = String(input.runId || "").trim();
  if (!runId) {
    return { ok: false, code: "invalid_request", message: "runId em falta." };
  }

  const projectRoot = resolveProjectRootForRun(runId);
  if (!projectRoot) {
    return { ok: false, code: "project_not_found", message: "Projeto da corrida não encontrado." };
  }

  let outputDir;
  try {
    outputDir = path.resolve(resolveOutputDir(runId, { warnLegacy: false }));
  } catch (e) {
    return {
      ok: false,
      code: "output_unavailable",
      message: String(e?.message || "Output da corrida indisponível."),
    };
  }

  if (!isGitRepository(projectRoot)) {
    return { ok: false, code: "git_not_repository", message: "O projeto não é um repositório Git." };
  }

  const pushWithCommit = tryGitPushAfterApprovedCommit({
    projectRoot,
    outputDir,
    runId,
    env: { ...process.env, SETUP_BOSS_GIT_AUTO_PUSH: "true" },
    writeReport: false,
  });

  if (pushWithCommit.ok === true) {
    const git = readRunGitState(outputDir);
    const remoteUrl = resolveRemoteDisplayUrl(projectRoot);
    try {
      emitRuntimeEvent({
        type: "git_branch_pushed",
        jobId: input.jobId ?? null,
        runId,
        projectId: input.projectId ?? null,
        data: {
          branch: pushWithCommit.branch ?? git?.activityBranch ?? null,
          remote: pushWithCommit.remote ?? DEFAULT_REMOTE,
        },
      });
    } catch (_) {
      /* */
    }
    return {
      ok: true,
      idempotent: false,
      message: "Branch publicada no remoto.",
      data: {
        runId,
        branch: pushWithCommit.branch ?? null,
        remote: pushWithCommit.remote ?? DEFAULT_REMOTE,
        remoteUrl,
        pushedAt: pushWithCommit.pushedAt ?? new Date().toISOString(),
        git,
      },
    };
  }

  if (pushWithCommit.skipped && pushWithCommit.reason === "already_pushed") {
    const git = readRunGitState(outputDir);
    const remoteUrl = resolveRemoteDisplayUrl(projectRoot);
    return {
      ok: true,
      idempotent: true,
      message: "Branch já estava publicada no remoto.",
      data: {
        runId,
        branch: pushWithCommit.branch ?? git?.activityBranch ?? null,
        remote: pushWithCommit.remote ?? DEFAULT_REMOTE,
        remoteUrl,
        git,
      },
    };
  }

  if (
    pushWithCommit.code !== GIT_PUSH_ERROR.COMMIT_REQUIRED &&
    pushWithCommit.ok !== false
  ) {
    return mapPushFailure(pushWithCommit);
  }

  const gitState = readRunGitState(outputDir);
  if (!gitState) {
    return {
      ok: false,
      code: GIT_PUSH_ERROR.BRANCH_REQUIRED,
      message: "Estado Git da corrida indisponível.",
    };
  }

  const gitStatus = gitState.status != null ? String(gitState.status).trim() : "";
  const activityBranch =
    gitState.activityBranch != null ? String(gitState.activityBranch).trim() : "";

  if (gitStatus !== GIT_BRANCH_READY || !activityBranch) {
    return {
      ok: false,
      code: GIT_PUSH_ERROR.BRANCH_REQUIRED,
      message: "Publicar branch exige versionamento concluído (branch preparada).",
    };
  }

  let currentBranch = null;
  try {
    currentBranch = getCurrentBranch(projectRoot);
  } catch (err) {
    return {
      ok: false,
      code: GIT_PUSH_ERROR.FAILED,
      message: sanitizeGitPushErrorMessage(err?.message || "Falha ao ler branch actual."),
    };
  }

  if (!currentBranch || currentBranch !== activityBranch) {
    return {
      ok: false,
      code: GIT_PUSH_ERROR.BRANCH_MISMATCH,
      message: `Checkout na branch da atividade (${activityBranch}) antes de publicar.`,
    };
  }

  if (isProtectedBranch(currentBranch)) {
    return {
      ok: false,
      code: GIT_PUSH_ERROR.PROTECTED_BRANCH,
      message: "Push bloqueado em branch protegida.",
    };
  }

  if (!hasGitRemote(projectRoot, DEFAULT_REMOTE)) {
    return {
      ok: false,
      code: GIT_PUSH_ERROR.NO_REMOTE,
      message: `Remote '${DEFAULT_REMOTE}' não configurado.`,
    };
  }

  try {
    const pushMeta = pushActivityBranchToOrigin(
      projectRoot,
      activityBranch,
      DEFAULT_REMOTE,
    );
    const pushedAt = new Date().toISOString();
    const git = persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.PUSHED,
      remote: pushMeta.remote,
      branch: pushMeta.branch,
      pushedAt,
      setUpstream: pushMeta.setUpstream,
    });
    const remoteUrl = resolveRemoteDisplayUrl(projectRoot);
    try {
      emitRuntimeEvent({
        type: "git_branch_pushed",
        jobId: input.jobId ?? null,
        runId,
        projectId: input.projectId ?? null,
        data: { branch: activityBranch, remote: DEFAULT_REMOTE },
      });
    } catch (_) {
      /* */
    }
    return {
      ok: true,
      idempotent: false,
      message: "Branch publicada no remoto.",
      data: {
        runId,
        branch: activityBranch,
        remote: DEFAULT_REMOTE,
        remoteUrl,
        pushedAt,
        git,
      },
    };
  } catch (err) {
    const message = sanitizeGitPushErrorMessage(err?.message || "git push falhou.");
    persistGitPushState(outputDir, {
      status: GIT_PUSH_STATUS.FAILED,
      errorCode: GIT_PUSH_ERROR.FAILED,
      errorMessage: message,
    });
    return { ok: false, code: GIT_PUSH_ERROR.FAILED, message };
  }
}

/**
 * @param {Record<string, unknown>} result
 */
function mapPushFailure(result) {
  const code = result.code != null ? String(result.code) : GIT_PUSH_ERROR.FAILED;
  const messages = {
    [GIT_PUSH_ERROR.BRANCH_MISMATCH]: "Checkout na branch da atividade antes de publicar.",
    [GIT_PUSH_ERROR.BRANCH_REQUIRED]: "Branch da atividade ainda não está pronta.",
    [GIT_PUSH_ERROR.NO_REMOTE]: `Remote '${DEFAULT_REMOTE}' não configurado no repositório.`,
    [GIT_PUSH_ERROR.PROTECTED_BRANCH]: "Push bloqueado em branch protegida.",
    [GIT_PUSH_ERROR.COMMIT_REQUIRED]:
      "Não foi possível publicar — confirme o versionamento e o estado da branch.",
  };
  return {
    ok: false,
    code,
    message: messages[code] || "Não foi possível publicar a branch.",
  };
}

module.exports = {
  pushRunGitBranch,
  resolveRemoteDisplayUrl,
};
