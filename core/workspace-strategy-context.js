"use strict";

const path = require("path");
const { parseWorkspaceGlobalSpec } = require("./parse-workspace-global-spec");

/**
 * @param {string} text
 */
function slugifyRepo(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

/**
 * @param {{ projectId: string, displayName?: string, projectRoot?: string }} row
 */
function repositoryLabels(row) {
  const root = row.projectRoot ? path.basename(String(row.projectRoot)) : "";
  const name = String(row.displayName || root || row.projectId).trim();
  const slug = slugifyRepo(root || name) || slugifyRepo(row.projectId);
  return {
    repositoryName: name,
    repositorySlug: slug || row.projectId,
  };
}

/**
 * @param {string[]} projectIds
 * @param {(id: string) => { projectId: string, displayName?: string, projectRoot?: string }|null} resolveProject
 */
function buildWorkspaceProjectCatalog(projectIds, resolveProject) {
  /** @type {import("./infer-mini-task-project").WorkspaceProjectCatalogEntry[]} */
  const catalog = [];
  for (const pid of projectIds || []) {
    const id = String(pid || "").trim();
    if (!id) continue;
    const row = typeof resolveProject === "function" ? resolveProject(id) : null;
    const labels = repositoryLabels({
      projectId: id,
      displayName: row?.displayName,
      projectRoot: row?.projectRoot,
    });
    catalog.push({
      projectId: id,
      displayName: labels.repositoryName,
      repositoryName: labels.repositoryName,
      repositorySlug: labels.repositorySlug,
      projectRoot: row?.projectRoot ? path.resolve(String(row.projectRoot)) : null,
    });
  }
  return catalog;
}

/**
 * @param {Array<{ workspaceRunId: string, workspaceId: string, globalSpec?: unknown }>} workspaceRuns
 * @param {string} planningRunId
 */
function findWorkspaceRunByPlanningRunId(workspaceRuns, planningRunId) {
  const runId = String(planningRunId || "").trim();
  if (!runId) return null;
  for (const row of workspaceRuns || []) {
    const spec = parseWorkspaceGlobalSpec(row.globalSpec);
    if (spec?.planningRunId === runId) {
      return { workspaceRun: row, spec };
    }
  }
  return null;
}

/**
 * @param {object} workspaceRunRow
 * @param {(id: string) => object|null} resolveProject
 */
function buildWorkspaceStrategyContextFromRun(workspaceRunRow, resolveProject) {
  const spec = parseWorkspaceGlobalSpec(workspaceRunRow?.globalSpec);
  if (!spec || !spec.projectIds.length) {
    return { ok: false, code: "workspace_spec_invalid", message: "globalSpec sem projectIds." };
  }
  const catalog = buildWorkspaceProjectCatalog(spec.projectIds, resolveProject);
  if (!catalog.length) {
    return {
      ok: false,
      code: "workspace_catalog_empty",
      message: "Nenhum projeto do workspace resolvido no registry.",
    };
  }
  return {
    ok: true,
    workspaceRunId: String(workspaceRunRow.workspaceRunId || "").trim(),
    workspaceId: String(workspaceRunRow.workspaceId || "").trim(),
    task: spec.task,
    projectIds: [...spec.projectIds],
    planningRunId: spec.planningRunId || null,
    planningProjectId: spec.planningProjectId || catalog[0].projectId,
    catalog,
    multiRepo: catalog.length > 1,
  };
}

module.exports = {
  slugifyRepo,
  repositoryLabels,
  buildWorkspaceProjectCatalog,
  findWorkspaceRunByPlanningRunId,
  buildWorkspaceStrategyContextFromRun,
};
