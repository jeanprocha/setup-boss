"use strict";

/**
 * Validação estrutural de WorkspaceRun (Fase B — sem orquestração).
 * @typedef {{ code: string, message: string, field?: string }} WorkspaceRunValidationIssue
 */

const {
  validateMiniActivitiesList,
  deriveChildRunIds,
} = require("./validate-mini-activity");

const WORKSPACE_RUN_STATUSES = Object.freeze([
  "draft",
  "planned",
  "running",
  "waiting_user_action",
  "failed",
  "completed",
  "cancelled",
]);

/** @param {unknown} raw */
function normalizeStringArray(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {string[]} */
  const out = [];
  for (const item of raw) {
    const s = item != null ? String(item).trim() : "";
    if (s) out.push(s);
  }
  return out;
}

/**
 * Título na criação: title explícito ou aliases instruction/task/prompt.
 * @param {object|null|undefined} input
 */
function resolveWorkspaceRunTitle(input) {
  const direct = input && input.title != null ? String(input.title).trim() : "";
  if (direct) return direct;
  for (const field of ["instruction", "task", "prompt"]) {
    if (input && input[field] != null) {
      const t = String(input[field]).trim();
      if (t) return t;
    }
  }
  return "";
}

/** @param {unknown} value */
function normalizeOptionalMarkdownField(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t ? t : null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return { .../** @type {Record<string, unknown>} */ (value) };
  }
  return null;
}

/**
 * @param {object} input
 * @param {{ findWorkspace?: (workspaceId: string) => object|null, isCreate?: boolean }} [opts]
 */
function validateWorkspaceRunFields(input, opts = {}) {
  const findWorkspace =
    typeof opts.findWorkspace === "function" ? opts.findWorkspace : () => null;
  const isCreate = opts.isCreate === true;

  /** @type {WorkspaceRunValidationIssue[]} */
  const errors = [];

  const workspaceId =
    input && input.workspaceId != null ? String(input.workspaceId).trim() : "";
  if (!workspaceId) {
    errors.push({
      code: "workspace_id_required",
      message: "workspaceId é obrigatório.",
      field: "workspaceId",
    });
  } else if (!findWorkspace(workspaceId)) {
    errors.push({
      code: "workspace_not_found",
      message: `Workspace não encontrado: ${workspaceId}`,
      field: "workspaceId",
    });
  }

  const title = resolveWorkspaceRunTitle(input);
  if (!title) {
    errors.push({
      code: "workspace_run_title_required",
      message: "Título da atividade global é obrigatório.",
      field: "title",
    });
  }

  const statusRaw =
    input && input.status != null ? String(input.status).trim() : "draft";
  const status = statusRaw || "draft";
  if (!WORKSPACE_RUN_STATUSES.includes(status)) {
    errors.push({
      code: "workspace_run_status_invalid",
      message: `Status inválido: ${status}`,
      field: "status",
    });
  }

  /** Fase criação: sem miniActivities, OES ou runtime materializado. */
  const miniActivitiesRaw = isCreate
    ? []
    : input && input.miniActivities !== undefined
      ? input.miniActivities
      : [];

  const childRunIdsRaw = isCreate
    ? []
    : input && input.childRunIds !== undefined
      ? input.childRunIds
      : [];

  let workspaceProjectIds = [];
  if (workspaceId && findWorkspace(workspaceId)) {
    const ws = findWorkspace(workspaceId);
    workspaceProjectIds = Array.isArray(ws && ws.projectIds) ? [...ws.projectIds] : [];
  }

  const miniValidated = isCreate
    ? { ok: true, errors: [], miniActivities: [] }
    : validateMiniActivitiesList(miniActivitiesRaw, {
        workspaceProjectIds,
      });
  if (!miniValidated.ok) {
    for (const e of miniValidated.errors) errors.push(e);
  }

  if (!isCreate && !Array.isArray(childRunIdsRaw)) {
    errors.push({
      code: "workspace_run_child_run_ids_invalid",
      message: "childRunIds deve ser um array.",
      field: "childRunIds",
    });
  }

  const description =
    input && input.description != null && String(input.description).trim()
      ? String(input.description).trim()
      : null;

  const globalSpec = normalizeOptionalMarkdownField(input && input.globalSpec);
  const globalPlan = normalizeOptionalMarkdownField(input && input.globalPlan);

  return {
    ok: errors.length === 0,
    errors,
    workspaceId: workspaceId || null,
    title: title || null,
    description,
    status: WORKSPACE_RUN_STATUSES.includes(status) ? status : "draft",
    globalSpec,
    globalPlan,
    miniActivities: miniValidated.ok ? miniValidated.miniActivities : [],
    childRunIds: Array.isArray(childRunIdsRaw)
      ? deriveChildRunIds(
          miniValidated.ok ? miniValidated.miniActivities : [],
          normalizeStringArray(childRunIdsRaw),
        )
      : [],
  };
}

module.exports = {
  WORKSPACE_RUN_STATUSES,
  normalizeStringArray,
  resolveWorkspaceRunTitle,
  validateWorkspaceRunFields,
};
