"use strict";

/**
 * Validação estrutural de Workspace (Fase A — sem runtime multi-projeto).
 * @typedef {{ code: string, message: string, field?: string, projectId?: string }} WorkspaceValidationIssue
 */

/** @param {unknown} raw */
function normalizeProjectIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const item of raw) {
    const pid = item != null ? String(item).trim() : "";
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    out.push(pid);
  }
  return out;
}

/**
 * @param {object} input
 * @param {{ findProject?: (projectId: string) => object|null, allowEmpty?: boolean }} [opts]
 * @returns {{ ok: boolean, errors: WorkspaceValidationIssue[], projectIds: string[], primaryProjectId: string|null }}
 */
function validateWorkspaceFields(input, opts = {}) {
  const findProject =
    typeof opts.findProject === "function" ? opts.findProject : () => null;
  const allowEmpty = opts.allowEmpty === true;

  /** @type {WorkspaceValidationIssue[]} */
  const errors = [];

  const name = input && input.name != null ? String(input.name).trim() : "";
  if (!name) {
    errors.push({
      code: "workspace_name_required",
      message: "Nome do workspace é obrigatório.",
      field: "name",
    });
  }

  const projectIds = normalizeProjectIds(input && input.projectIds);
  if (!allowEmpty && projectIds.length === 0) {
    errors.push({
      code: "workspace_empty",
      message: "Workspace deve incluir pelo menos um projeto.",
      field: "projectIds",
    });
  }

  const rawIds = input && Array.isArray(input.projectIds) ? input.projectIds : [];
  const rawSeen = new Set();
  for (const item of rawIds) {
    const pid = item != null ? String(item).trim() : "";
    if (!pid) continue;
    if (rawSeen.has(pid)) {
      errors.push({
        code: "workspace_duplicate_projects",
        message: `Projeto duplicado no workspace: ${pid}`,
        field: "projectIds",
        projectId: pid,
      });
      break;
    }
    rawSeen.add(pid);
  }

  for (const pid of projectIds) {
    if (!findProject(pid)) {
      errors.push({
        code: "project_not_found",
        message: `Projeto não encontrado no registry: ${pid}`,
        field: "projectIds",
        projectId: pid,
      });
    }
  }

  let primaryProjectId = null;
  if (input && input.primaryProjectId != null && String(input.primaryProjectId).trim()) {
    primaryProjectId = String(input.primaryProjectId).trim();
    if (!projectIds.includes(primaryProjectId)) {
      errors.push({
        code: "primary_project_not_in_workspace",
        message: "primaryProjectId deve pertencer a projectIds.",
        field: "primaryProjectId",
        projectId: primaryProjectId,
      });
    }
  }

  const description =
    input && input.description != null && String(input.description).trim()
      ? String(input.description).trim()
      : null;

  return {
    ok: errors.length === 0,
    errors,
    name: name || null,
    description,
    projectIds,
    primaryProjectId,
  };
}

module.exports = {
  normalizeProjectIds,
  validateWorkspaceFields,
};
