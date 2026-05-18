"use strict";

const WORKSPACE_GIT_STATUSES = Object.freeze([
  "pending",
  "preparing",
  "ready",
  "partial_failure",
  "failed",
]);

const PROJECT_GIT_STATUSES = Object.freeze([
  "pending",
  "preparing",
  "ready",
  "skipped",
  "failed",
]);

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
function normalizeWorkspaceGitProject(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const projectId = raw.projectId != null ? String(raw.projectId).trim() : "";
  if (!projectId) return null;

  const gitStatusRaw =
    raw.gitStatus != null ? String(raw.gitStatus).trim() : "pending";
  const prepareRaw =
    raw.prepareBranchStatus != null
      ? String(raw.prepareBranchStatus).trim()
      : gitStatusRaw;

  const gitStatus = PROJECT_GIT_STATUSES.includes(gitStatusRaw) ? gitStatusRaw : "pending";
  const prepareBranchStatus = PROJECT_GIT_STATUSES.includes(prepareRaw)
    ? prepareRaw
    : gitStatus;

  return {
    projectId,
    baseBranch:
      raw.baseBranch != null && String(raw.baseBranch).trim()
        ? String(raw.baseBranch).trim()
        : null,
    activityBranch:
      raw.activityBranch != null && String(raw.activityBranch).trim()
        ? String(raw.activityBranch).trim()
        : null,
    gitStatus,
    prepareBranchStatus,
    lastGitEventAt:
      raw.lastGitEventAt != null && String(raw.lastGitEventAt).trim()
        ? String(raw.lastGitEventAt).trim()
        : null,
    commitSha:
      raw.commitSha != null && String(raw.commitSha).trim()
        ? String(raw.commitSha).trim()
        : null,
    prUrl:
      raw.prUrl != null && String(raw.prUrl).trim() ? String(raw.prUrl).trim() : null,
    errorCode:
      raw.errorCode != null && String(raw.errorCode).trim()
        ? String(raw.errorCode).trim()
        : null,
    errorMessage:
      raw.errorMessage != null && String(raw.errorMessage).trim()
        ? String(raw.errorMessage).trim()
        : null,
  };
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
function normalizeWorkspaceGit(raw) {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;

  const statusRaw = raw.status != null ? String(raw.status).trim() : "pending";
  const status = WORKSPACE_GIT_STATUSES.includes(statusRaw) ? statusRaw : "pending";

  const activityBranch =
    raw.activityBranch != null && String(raw.activityBranch).trim()
      ? String(raw.activityBranch).trim()
      : null;

  const projects = [];
  if (Array.isArray(raw.projects)) {
    for (const p of raw.projects) {
      const norm = normalizeWorkspaceGitProject(p);
      if (norm) projects.push(norm);
    }
  }

  return {
    activityBranch,
    status,
    preparedAt:
      raw.preparedAt != null && String(raw.preparedAt).trim()
        ? String(raw.preparedAt).trim()
        : null,
    projects,
  };
}

/**
 * @param {object[]} projects
 * @returns {string}
 */
function aggregateWorkspaceGitStatus(projects) {
  if (!projects || projects.length === 0) return "pending";
  const relevant = projects.filter((p) => p && p.gitStatus !== "skipped");
  if (relevant.length === 0) return "ready";

  const allReady = relevant.every((p) => p.gitStatus === "ready");
  if (allReady) return "ready";

  const anyPreparing = relevant.some(
    (p) => p.gitStatus === "preparing" || p.prepareBranchStatus === "preparing",
  );
  if (anyPreparing) return "preparing";

  const anyFailed = relevant.some((p) => p.gitStatus === "failed");
  const anyReady = relevant.some((p) => p.gitStatus === "ready");
  if (anyFailed && anyReady) return "partial_failure";
  if (anyFailed) return "failed";

  return "pending";
}

/**
 * @param {object|null|undefined} git
 * @returns {boolean}
 */
function isWorkspaceGitReady(git) {
  if (!git || typeof git !== "object") return false;
  return String(git.status || "") === "ready" && Boolean(git.activityBranch);
}

module.exports = {
  WORKSPACE_GIT_STATUSES,
  PROJECT_GIT_STATUSES,
  normalizeWorkspaceGit,
  normalizeWorkspaceGitProject,
  aggregateWorkspaceGitStatus,
  isWorkspaceGitReady,
};
