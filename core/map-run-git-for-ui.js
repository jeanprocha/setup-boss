"use strict";

const { GIT_BRANCH_READY } = require("./validate-git-execute-gate");

const GIT_BRANCH_FAILED = "git_branch_failed";

/** Códigos de erro expostos à UI (sem stack / paths internos). */
const ALLOWED_GIT_ERROR_CODES = new Set([
  "git_branch_required",
  "git_branch_mismatch",
  "git_not_repository",
  "git_branch_unknown",
  "git_dirty_worktree",
  "git_pull_failed",
  "git_branch_exists",
  "git_invalid_branch",
  "git_timeout",
  "git_unknown_error",
]);

const ALLOWED_EXECUTE_BLOCK_CODES = new Set([
  "git_branch_required",
  "git_branch_mismatch",
  "git_not_repository",
  "git_branch_unknown",
]);

/**
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function sanitizeGitUserMessage(raw) {
  const s = raw != null ? String(raw).trim() : "";
  if (!s) return null;
  const line = s.split(/\r?\n/)[0].trim();
  if (!line) return null;
  if (/^\s*at\s+/.test(line) || line.includes("Error:")) {
    return null;
  }
  if (line.length > 240) return `${line.slice(0, 239)}…`;
  return line;
}

/**
 * @param {unknown} code
 * @returns {string|null}
 */
function normalizePublicErrorCode(code) {
  const c = code != null ? String(code).trim() : "";
  if (!c) return null;
  if (ALLOWED_GIT_ERROR_CODES.has(c)) return c;
  return "git_unknown_error";
}

/**
 * @param {unknown} code
 * @returns {string|null}
 */
function normalizeExecuteBlockCode(code) {
  const c = code != null ? String(code).trim() : "";
  if (!c) return null;
  if (ALLOWED_EXECUTE_BLOCK_CODES.has(c)) return c;
  return null;
}

/**
 * Mapeia `run-context.git` para contrato UI (branchHint + git).
 *
 * @param {Record<string, unknown>|null|undefined} gitState
 * @param {{ executeBlockCode?: string|null, currentBranch?: string|null }} [opts]
 * @returns {{ branchHint: string|null, git: Record<string, unknown>|null }}
 */
function mapRunGitForUi(gitState, opts = {}) {
  const executeBlockCode = normalizeExecuteBlockCode(opts.executeBlockCode);
  const currentBranch =
    opts.currentBranch != null ? String(opts.currentBranch).trim() : "";

  if (!gitState || typeof gitState !== "object" || Array.isArray(gitState)) {
    if (!executeBlockCode) {
      return { branchHint: null, git: null };
    }
    return {
      branchHint: null,
      git: { executeBlockCode },
    };
  }

  const status = gitState.status != null ? String(gitState.status).trim() : "";
  const activityBranch =
    gitState.activityBranch != null ? String(gitState.activityBranch).trim() : "";

  if (!status && !activityBranch && !executeBlockCode) {
    return { branchHint: null, git: null };
  }

  /** @type {Record<string, unknown>} */
  const git = {};
  if (status) git.status = status;
  if (activityBranch) git.activityBranch = activityBranch;

  if (status === GIT_BRANCH_FAILED) {
    const errorCode = normalizePublicErrorCode(gitState.errorCode);
    if (errorCode) git.errorCode = errorCode;
    const errorMessage = sanitizeGitUserMessage(gitState.errorMessage);
    if (errorMessage) git.errorMessage = errorMessage;
  }

  if (executeBlockCode) {
    git.executeBlockCode = executeBlockCode;
  }
  if (currentBranch) {
    git.currentBranch = currentBranch;
  }

  const push =
    gitState.push && typeof gitState.push === "object" && !Array.isArray(gitState.push)
      ? /** @type {Record<string, unknown>} */ (gitState.push)
      : null;
  if (push) {
    if (push.status != null) git.pushStatus = String(push.status);
    if (push.remote != null) git.pushRemote = String(push.remote);
    if (push.branch != null) git.pushBranch = String(push.branch);
    if (push.pushedAt != null) git.pushedAt = String(push.pushedAt);
    if (push.errorMessage != null) {
      const pm = sanitizeGitUserMessage(push.errorMessage);
      if (pm) git.pushErrorMessage = pm;
    }
  }

  const branchHint =
    status === GIT_BRANCH_READY && activityBranch ? activityBranch : null;

  return {
    branchHint,
    git: Object.keys(git).length > 0 ? git : null,
  };
}

module.exports = {
  GIT_BRANCH_READY,
  GIT_BRANCH_FAILED,
  ALLOWED_GIT_ERROR_CODES,
  ALLOWED_EXECUTE_BLOCK_CODES,
  sanitizeGitUserMessage,
  mapRunGitForUi,
};
