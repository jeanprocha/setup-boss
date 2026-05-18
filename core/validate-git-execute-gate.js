"use strict";

const { isGitRepository, getCurrentBranch } = require("./git-exec");

const GIT_BRANCH_READY = "git_branch_ready";

/** @type {ReadonlySet<string>} */
const PROTECTED_BRANCHES = new Set([
  "main",
  "master",
  "develop",
  "production",
  "release",
]);

const MESSAGES = Object.freeze({
  git_branch_required: "Prepare a branch da atividade antes de executar.",
  git_branch_mismatch:
    "A branch actual não coincide com a branch preparada para esta atividade.",
  git_not_repository: "O projeto não é um repositório Git válido.",
  git_branch_unknown: "Não foi possível detectar a branch actual do repositório.",
});

/**
 * @param {string|null|undefined} branchName
 * @returns {boolean}
 */
function isProtectedBranch(branchName) {
  const b = branchName != null ? String(branchName).trim().toLowerCase() : "";
  return b.length > 0 && PROTECTED_BRANCHES.has(b);
}

/**
 * @param {string} code
 * @param {string} [message]
 * @returns {{ ok: false, code: string, message: string }}
 */
function fail(code, message) {
  return {
    ok: false,
    code,
    message: message || MESSAGES[code] || code,
  };
}

/**
 * Gate server-side: bloqueia execução insegura em branches protegidas sem branch preparada.
 *
 * @param {{
 *   projectRoot: string|null|undefined,
 *   gitState?: Record<string, unknown>|null,
 * }} input
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function validateGitExecuteGate(input) {
  const projectRoot =
    input.projectRoot != null ? String(input.projectRoot).trim() : "";
  if (!projectRoot) {
    return { ok: true };
  }

  if (!isGitRepository(projectRoot)) {
    return fail("git_not_repository");
  }

  /** @type {string|null} */
  let currentBranch = null;
  try {
    currentBranch = getCurrentBranch(projectRoot);
  } catch {
    return fail("git_branch_unknown");
  }

  if (!currentBranch) {
    return fail("git_branch_unknown");
  }

  const git =
    input.gitState && typeof input.gitState === "object" && !Array.isArray(input.gitState)
      ? input.gitState
      : {};
  const status = git.status != null ? String(git.status).trim() : "";
  const activityBranch =
    git.activityBranch != null ? String(git.activityBranch).trim() : "";

  const onProtected = isProtectedBranch(currentBranch);

  if (onProtected) {
    if (status !== GIT_BRANCH_READY) {
      return fail("git_branch_required");
    }
    if (!activityBranch) {
      return fail("git_branch_required");
    }
    if (currentBranch !== activityBranch) {
      return fail("git_branch_mismatch");
    }
    return { ok: true };
  }

  if (status === GIT_BRANCH_READY && activityBranch && currentBranch !== activityBranch) {
    return fail("git_branch_mismatch");
  }

  return { ok: true };
}

module.exports = {
  GIT_BRANCH_READY,
  PROTECTED_BRANCHES,
  MESSAGES,
  isProtectedBranch,
  validateGitExecuteGate,
};
