"use strict";

const fs = require("fs");
const path = require("path");

const { suggestWorkspaceActivityBranchName } = require("../../../core/suggest-workspace-activity-branch");
const {
  normalizeWorkspaceGit,
  aggregateWorkspaceGitStatus,
  isWorkspaceGitReady,
} = require("../../../core/validate-workspace-git");
const {
  isGitRepository,
  getCurrentBranch,
  getHeadCommit,
  gitExecInRepoSync,
  gitSpawn,
  branchExistsLocal,
  hasGitRemote,
  resolveBaseBranchName,
} = require("../../../core/git-exec");
const {
  normalizeActivityBranchInput,
  inspectWorkingTreeForGitPrepare,
  formatDirtyWorktreeBlockMessage,
  mapPrepareGitError,
} = require("./run-git-branch-api");
const { findProjectRecord } = require("./project-registry");
const { getWorkspace } = require("./workspace-registry");
const {
  getWorkspaceRun,
  loadWorkspaceRunsUnsafe,
  saveWorkspaceRuns,
} = require("./workspace-run-registry");

const WORKSPACE_PREP_OUTPUT_SEGMENT = "_workspace_git_prep";

/**
 * @param {{ miniActivities?: { targetProjectId?: string }[] }} wsRun
 * @param {{ projectIds?: string[] }} workspace
 * @returns {string[]}
 */
function deriveParticipatingProjectIds(wsRun, workspace) {
  const allowed = new Set(
    (workspace && Array.isArray(workspace.projectIds) ? workspace.projectIds : []).map(
      (id) => String(id).trim(),
    ),
  );
  /** @type {Set<string>} */
  const ids = new Set();
  for (const m of wsRun.miniActivities || []) {
    if (!m || !m.targetProjectId) continue;
    const pid = String(m.targetProjectId).trim();
    if (!pid) continue;
    if (allowed.size > 0 && !allowed.has(pid)) continue;
    ids.add(pid);
  }
  return [...ids];
}

/**
 * @param {string} projectRoot
 * @param {string} baseBranch
 */
async function pullFfOnlyFromOrigin(projectRoot, baseBranch) {
  const root = path.resolve(projectRoot);
  await gitSpawn(["-C", root, "fetch", "origin"], { timeoutMs: 120_000 });
  await gitSpawn(["-C", root, "checkout", baseBranch], { timeoutMs: 60_000 });
  await gitSpawn(["-C", root, "pull", "--ff-only", "origin", baseBranch], { timeoutMs: 120_000 });
}

/**
 * @param {string} projectRoot
 * @returns {string}
 */
function workspacePrepOutputDir(projectRoot) {
  const out = path.join(
    path.resolve(projectRoot),
    "docs",
    ".IA",
    "outputs",
    WORKSPACE_PREP_OUTPUT_SEGMENT,
  );
  fs.mkdirSync(out, { recursive: true });
  return out;
}

/**
 * Prepara branch de atividade no root do projeto (sem run filho).
 *
 * @param {{ projectRoot: string, activityBranch: string, baseBranch?: string|null }} input
 */
async function prepareProjectGitAtRoot(input) {
  const projectRoot = path.resolve(String(input.projectRoot || ""));
  const norm = normalizeActivityBranchInput(input.activityBranch);
  if (!norm.ok) {
    return { ok: false, code: norm.code, message: norm.message };
  }
  const activityBranch = norm.branch;

  if (!isGitRepository(projectRoot)) {
    return {
      ok: false,
      code: "git_not_repository",
      message: "O projeto-alvo não é um repositório Git.",
    };
  }

  const prepOut = workspacePrepOutputDir(projectRoot);
  try {
    const dirtyInspection = inspectWorkingTreeForGitPrepare(projectRoot, prepOut);
    if (dirtyInspection.blocked) {
      return {
        ok: false,
        code: "git_dirty_worktree",
        message: formatDirtyWorktreeBlockMessage(dirtyInspection),
        data: { projectRoot, dirtyWorktree: dirtyInspection },
      };
    }
  } catch (err) {
    const mapped = mapPrepareGitError(err);
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  const baseBranch =
    input.baseBranch != null && String(input.baseBranch).trim()
      ? String(input.baseBranch).trim()
      : resolveBaseBranchName(projectRoot);
  if (!baseBranch) {
    return {
      ok: false,
      code: "git_unknown_error",
      message: "Não foi possível detectar a branch base (main/master).",
    };
  }

  try {
    if (branchExistsLocal(projectRoot, activityBranch)) {
      gitExecInRepoSync(projectRoot, ["checkout", activityBranch], { stdio: "ignore" });
      const head = getHeadCommit(projectRoot);
      return {
        ok: true,
        idempotent: true,
        baseBranch,
        activityBranch,
        commitSha: head,
        currentBranch: getCurrentBranch(projectRoot),
      };
    }

    gitExecInRepoSync(projectRoot, ["checkout", baseBranch], { stdio: "ignore" });

    if (hasGitRemote(projectRoot, "origin")) {
      try {
        await pullFfOnlyFromOrigin(projectRoot, baseBranch);
      } catch (pullErr) {
        const mapped = mapPrepareGitError(pullErr);
        mapped.code = mapped.code === "git_unknown_error" ? "git_pull_failed" : mapped.code;
        return { ok: false, code: mapped.code, message: mapped.message };
      }
    }

    gitExecInRepoSync(projectRoot, ["checkout", "-b", activityBranch], { stdio: "ignore" });
    const commitSha = getHeadCommit(projectRoot);

    return {
      ok: true,
      idempotent: false,
      baseBranch,
      activityBranch,
      commitSha,
      currentBranch: getCurrentBranch(projectRoot),
    };
  } catch (err) {
    const mapped = mapPrepareGitError(err);
    return { ok: false, code: mapped.code, message: mapped.message };
  }
}

/**
 * @param {string[]} projectIds
 * @param {string} activityBranch
 * @param {Set<string>} skipIds
 */
function buildInitialProjectGitRows(projectIds, activityBranch, skipIds) {
  const now = new Date().toISOString();
  return projectIds.map((projectId) => {
    if (skipIds.has(projectId)) {
      return {
        projectId,
        baseBranch: null,
        activityBranch,
        gitStatus: "skipped",
        prepareBranchStatus: "skipped",
        lastGitEventAt: now,
        commitSha: null,
        prUrl: null,
        errorCode: null,
        errorMessage: null,
      };
    }
    return {
      projectId,
      baseBranch: null,
      activityBranch,
      gitStatus: "pending",
      prepareBranchStatus: "pending",
      lastGitEventAt: null,
      commitSha: null,
      prUrl: null,
      errorCode: null,
      errorMessage: null,
    };
  });
}

/**
 * @param {object} git
 * @param {string} workspaceRunId
 */
function persistWorkspaceGit(workspaceRunId, git) {
  const id = String(workspaceRunId || "").trim();
  const payload = loadWorkspaceRunsUnsafe();
  const idx = payload.workspaceRuns.findIndex((r) => r && r.workspaceRunId === id);
  if (idx < 0) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${id}` };
  }
  const row = payload.workspaceRuns[idx];
  payload.workspaceRuns[idx] = {
    ...row,
    git: normalizeWorkspaceGit(git),
    updatedAt: new Date().toISOString(),
  };
  saveWorkspaceRuns(payload);
  const updated = getWorkspaceRun(id);
  return { ok: true, workspaceRun: updated };
}

/**
 * @param {string} workspaceRunId
 * @param {{ skipProjectIds?: string[], activityBranch?: string|null, force?: boolean }} [opts]
 */
async function prepareWorkspaceRunGit(workspaceRunId, opts = {}) {
  const id = String(workspaceRunId || "").trim();
  if (!id) {
    return { ok: false, code: "invalid_request", message: "workspaceRunId inválido." };
  }

  const row = getWorkspaceRun(id);
  if (!row) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${id}` };
  }

  const ws = getWorkspace(row.workspaceId);
  if (!ws) {
    return { ok: false, code: "workspace_not_found", message: "Workspace não encontrado." };
  }

  const projectIds = deriveParticipatingProjectIds(row, ws);
  if (projectIds.length === 0) {
    return {
      ok: false,
      code: "workspace_run_no_participating_projects",
      message: "Nenhum projeto participante nas miniActivities.",
    };
  }

  const skipIds = new Set(
    (opts.skipProjectIds || []).map((x) => String(x).trim()).filter(Boolean),
  );

  for (const pid of skipIds) {
    if (!projectIds.includes(pid)) {
      return {
        ok: false,
        code: "project_not_in_workspace_run",
        message: `Projeto não participa deste WorkspaceRun: ${pid}`,
      };
    }
  }

  const prevGit = normalizeWorkspaceGit(row.git);
  let activityBranch =
    opts.activityBranch != null && String(opts.activityBranch).trim()
      ? String(opts.activityBranch).trim()
      : prevGit && prevGit.activityBranch
        ? prevGit.activityBranch
        : suggestWorkspaceActivityBranchName(row.title, id);

  const branchNorm = normalizeActivityBranchInput(activityBranch);
  if (!branchNorm.ok) {
    return { ok: false, code: branchNorm.code, message: branchNorm.message };
  }
  activityBranch = branchNorm.branch;

  if (
    !opts.force &&
    prevGit &&
    prevGit.status === "ready" &&
    prevGit.activityBranch === activityBranch &&
    isWorkspaceGitReady(prevGit)
  ) {
    const allReady = (prevGit.projects || []).every(
      (p) => p.gitStatus === "ready" || p.gitStatus === "skipped",
    );
    if (allReady) {
      return {
        ok: true,
        idempotent: true,
        workspaceRun: row,
        git: prevGit,
        message: "Git do workspace já preparado.",
      };
    }
  }

  /** @type {object[]} */
  let projects = buildInitialProjectGitRows(projectIds, activityBranch, skipIds);

  let git = {
    activityBranch,
    status: "preparing",
    preparedAt: null,
    projects,
  };
  let saved = persistWorkspaceGit(id, git);
  if (!saved.ok) return saved;

  const force = opts.force === true;

  for (let i = 0; i < projects.length; i += 1) {
    const entry = projects[i];
    if (entry.gitStatus === "skipped") continue;

    const prevEntry =
      prevGit && Array.isArray(prevGit.projects)
        ? prevGit.projects.find((p) => p && p.projectId === entry.projectId)
        : null;

    if (
      !force &&
      prevEntry &&
      prevEntry.gitStatus === "ready" &&
      prevEntry.activityBranch === activityBranch &&
      prevEntry.baseBranch
    ) {
      projects[i] = {
        ...entry,
        ...prevEntry,
        activityBranch,
        lastGitEventAt: new Date().toISOString(),
      };
      continue;
    }

    const record = findProjectRecord(entry.projectId);
    if (!record || !record.projectRoot) {
      projects[i] = {
        ...entry,
        gitStatus: "failed",
        prepareBranchStatus: "failed",
        lastGitEventAt: new Date().toISOString(),
        errorCode: "project_not_found",
        errorMessage: `Projeto inexistente: ${entry.projectId}`,
      };
      continue;
    }

    projects[i] = {
      ...entry,
      gitStatus: "preparing",
      prepareBranchStatus: "preparing",
      lastGitEventAt: new Date().toISOString(),
    };
    git = {
      activityBranch,
      status: aggregateWorkspaceGitStatus(projects),
      preparedAt: null,
      projects,
    };
    persistWorkspaceGit(id, git);

    const prep = await prepareProjectGitAtRoot({
      projectRoot: record.projectRoot,
      activityBranch,
      baseBranch: prevEntry && prevEntry.baseBranch ? prevEntry.baseBranch : null,
    });

    const now = new Date().toISOString();
    if (prep.ok) {
      projects[i] = {
        ...entry,
        baseBranch: prep.baseBranch || null,
        activityBranch,
        gitStatus: "ready",
        prepareBranchStatus: "ready",
        lastGitEventAt: now,
        commitSha: prep.commitSha || null,
        errorCode: null,
        errorMessage: null,
      };
    } else {
      projects[i] = {
        ...entry,
        baseBranch: prep.baseBranch || null,
        activityBranch,
        gitStatus: "failed",
        prepareBranchStatus: "failed",
        lastGitEventAt: now,
        errorCode: prep.code || "git_prepare_failed",
        errorMessage: prep.message || "Falha ao preparar branch.",
      };
    }
  }

  const finalStatus = aggregateWorkspaceGitStatus(projects);
  git = {
    activityBranch,
    status: finalStatus,
    preparedAt: finalStatus === "ready" ? new Date().toISOString() : null,
    projects,
  };
  saved = persistWorkspaceGit(id, git);
  if (!saved.ok) return saved;

  return {
    ok: finalStatus === "ready",
    idempotent: false,
    workspaceRun: saved.workspaceRun,
    git,
    code: finalStatus === "ready" ? undefined : "workspace_git_prepare_incomplete",
    message:
      finalStatus === "ready"
        ? "Git do workspace preparado."
        : finalStatus === "partial_failure"
          ? "Prepare Git concluído com falhas parciais."
          : "Prepare Git falhou.",
  };
}

/**
 * @param {string} workspaceRunId
 * @param {string} projectId
 * @param {{ force?: boolean }} [opts]
 */
async function retryPrepareWorkspaceGitProject(workspaceRunId, projectId, opts = {}) {
  const id = String(workspaceRunId || "").trim();
  const pid = String(projectId || "").trim();
  const row = getWorkspaceRun(id);
  if (!row) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${id}` };
  }

  const git = normalizeWorkspaceGit(row.git);
  if (!git || !git.activityBranch) {
    return {
      ok: false,
      code: "workspace_git_not_initialized",
      message: "Execute prepare-git no workspace antes do retry por projeto.",
    };
  }

  const ws = getWorkspace(row.workspaceId);
  const participating = deriveParticipatingProjectIds(row, ws || { projectIds: [] });
  if (!participating.includes(pid)) {
    return {
      ok: false,
      code: "project_not_in_workspace_run",
      message: `Projeto não participa deste WorkspaceRun: ${pid}`,
    };
  }

  const activityBranch = git.activityBranch;
  /** @type {object[]} */
  let projects = Array.isArray(git.projects) ? git.projects.map((p) => ({ ...p })) : [];
  if (!projects.some((p) => p && p.projectId === pid)) {
    projects.push({
      projectId: pid,
      baseBranch: null,
      activityBranch,
      gitStatus: "pending",
      prepareBranchStatus: "pending",
      lastGitEventAt: null,
      commitSha: null,
      prUrl: null,
      errorCode: null,
      errorMessage: null,
    });
  }

  const idx = projects.findIndex((p) => p && p.projectId === pid);
  const entry = projects[idx];
  if (entry.gitStatus === "skipped" && opts.force !== true) {
    return {
      ok: false,
      code: "project_git_skipped",
      message: `Projeto marcado como skipped: ${pid}`,
    };
  }

  const record = findProjectRecord(pid);
  if (!record || !record.projectRoot) {
    projects[idx] = {
      ...entry,
      gitStatus: "failed",
      prepareBranchStatus: "failed",
      lastGitEventAt: new Date().toISOString(),
      errorCode: "project_not_found",
      errorMessage: `Projeto inexistente: ${pid}`,
    };
  } else {
    projects[idx] = {
      ...entry,
      activityBranch,
      gitStatus: "preparing",
      prepareBranchStatus: "preparing",
      lastGitEventAt: new Date().toISOString(),
    };
    persistWorkspaceGit(id, {
      activityBranch,
      status: "preparing",
      preparedAt: git.preparedAt,
      projects,
    });

    const prep = await prepareProjectGitAtRoot({
      projectRoot: record.projectRoot,
      activityBranch,
      baseBranch: entry.baseBranch || null,
    });
    const now = new Date().toISOString();
    projects[idx] = prep.ok
      ? {
          ...entry,
          baseBranch: prep.baseBranch || null,
          activityBranch,
          gitStatus: "ready",
          prepareBranchStatus: "ready",
          lastGitEventAt: now,
          commitSha: prep.commitSha || null,
          errorCode: null,
          errorMessage: null,
        }
      : {
          ...entry,
          activityBranch,
          gitStatus: "failed",
          prepareBranchStatus: "failed",
          lastGitEventAt: now,
          errorCode: prep.code || "git_prepare_failed",
          errorMessage: prep.message || "Falha ao preparar branch.",
        };
  }

  const finalStatus = aggregateWorkspaceGitStatus(projects);
  const nextGit = {
    activityBranch,
    status: finalStatus,
    preparedAt: finalStatus === "ready" ? new Date().toISOString() : git.preparedAt,
    projects,
  };
  const saved = persistWorkspaceGit(id, nextGit);
  if (!saved.ok) return saved;

  const proj = projects[idx];
  const projectOk = proj && proj.gitStatus === "ready";

  return {
    ok: projectOk,
    retriedProjectId: pid,
    workspaceRun: saved.workspaceRun,
    git: nextGit,
    code: projectOk ? undefined : "workspace_git_prepare_incomplete",
    message: projectOk ? "Retry de prepare Git concluído." : "Retry de prepare Git falhou.",
  };
}

/**
 * @param {string} workspaceRunId
 */
function getWorkspaceRunGitStatus(workspaceRunId) {
  const row = getWorkspaceRun(workspaceRunId);
  if (!row) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${workspaceRunId}` };
  }
  const git = normalizeWorkspaceGit(row.git);
  return {
    ok: true,
    workspaceRunId: row.workspaceRunId,
    git: git || {
      activityBranch: null,
      status: "pending",
      preparedAt: null,
      projects: [],
    },
    ready: isWorkspaceGitReady(git),
  };
}

/**
 * @param {import("./workspace-run-registry").WorkspaceRunRecord|ReturnType<typeof getWorkspaceRun>} wsRun
 */
function assertWorkspaceGitReadyForExecution(wsRun) {
  const git = normalizeWorkspaceGit(wsRun && wsRun.git);
  if (!git || !git.activityBranch) {
    return {
      ok: false,
      code: "workspace_git_not_ready",
      message:
        "Git do workspace não preparado. Execute POST /workspace-runs/:id/prepare-git antes de iniciar.",
    };
  }
  if (!isWorkspaceGitReady(git)) {
    const st = String(git.status || "pending");
    return {
      ok: false,
      code: st === "partial_failure" ? "workspace_git_partial_failure" : "workspace_git_not_ready",
      message: `Git do workspace não está ready (status=${st}).`,
    };
  }
  return { ok: true, activityBranch: git.activityBranch };
}

module.exports = {
  deriveParticipatingProjectIds,
  prepareProjectGitAtRoot,
  prepareWorkspaceRunGit,
  retryPrepareWorkspaceGitProject,
  getWorkspaceRunGitStatus,
  assertWorkspaceGitReadyForExecution,
  isWorkspaceGitReady,
  persistWorkspaceGit,
};
