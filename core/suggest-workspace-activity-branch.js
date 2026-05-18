"use strict";

const {
  slugifyActivityTitle,
  sanitizeBranchSegment,
  clampBranchLength,
} = require("./suggest-activity-branch");

const WORKSPACE_BRANCH_PREFIX = "feature/workspace-run";

/**
 * Extrai slug estável do workspaceRunId (ex.: wsrun_20260516-120000-auth-refactor → auth-refactor).
 *
 * @param {string} workspaceRunId
 * @returns {string}
 */
function slugFromWorkspaceRunId(workspaceRunId) {
  const raw = String(workspaceRunId || "").trim();
  const m = /^wsrun_\d{8}-\d{6}-(.+)$/.exec(raw);
  if (m && m[1]) {
    return slugifyActivityTitle(m[1].replace(/-[a-f0-9]{4}$/i, ""));
  }
  const fallback = raw.replace(/^wsrun_/, "");
  return slugifyActivityTitle(fallback);
}

/**
 * Nome determinístico de branch global do WorkspaceRun.
 * Ex.: feature/workspace-run-auth-refactor
 *
 * @param {string} title
 * @param {string} workspaceRunId
 * @returns {string}
 */
function suggestWorkspaceActivityBranchName(title, workspaceRunId) {
  const titleSlug = slugifyActivityTitle(title);
  const idSlug = slugFromWorkspaceRunId(workspaceRunId);
  const slug = titleSlug || idSlug || "activity";
  const branch = `${WORKSPACE_BRANCH_PREFIX}-${slug}`;
  return clampBranchLength(sanitizeBranchSegment(branch));
}

module.exports = {
  WORKSPACE_BRANCH_PREFIX,
  slugFromWorkspaceRunId,
  suggestWorkspaceActivityBranchName,
};
