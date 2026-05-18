"use strict";

/**
 * Schema e validação de miniActivities (Fase C).
 * @typedef {{ code: string, message: string, field?: string, miniActivityId?: string }} MiniActivityValidationIssue
 * @typedef {{ miniActivityId: string, order: number, title: string, description: string|null, targetProjectId: string, status: string, runId: string|null, dependsOnMiniActivityIds: string[], createdAt: string, updatedAt: string }} MiniActivityRecord
 */

const MINI_ACTIVITY_STATUSES = Object.freeze([
  "pending",
  "ready",
  "running",
  "waiting_user_action",
  "failed",
  "completed",
  "skipped",
  "cancelled",
]);

/** @param {unknown} raw */
function normalizeDependsOn(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const item of raw) {
    const id = item != null ? String(item).trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Deteção de ciclo simples no grafo dependsOn (DFS).
 * @param {MiniActivityRecord[]} miniActivities
 */
function hasMiniActivityDependencyCycle(miniActivities) {
  const byId = new Map(
    miniActivities.map((m) => [m.miniActivityId, m]),
  );

  /** @type {Set<string>} */
  const visiting = new Set();
  /** @type {Set<string>} */
  const done = new Set();

  /** @param {string} id */
  function dfs(id) {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const row = byId.get(id);
    const deps = row ? row.dependsOnMiniActivityIds : [];
    for (const dep of deps) {
      if (!byId.has(dep)) continue;
      if (dfs(dep)) return true;
    }
    visiting.delete(id);
    done.add(id);
    return false;
  }

  for (const m of miniActivities) {
    if (dfs(m.miniActivityId)) return true;
  }
  return false;
}

/**
 * @param {unknown} raw
 * @param {{ workspaceProjectIds: string[], existing?: MiniActivityRecord|null, now?: string }} ctx
 * @returns {{ ok: boolean, errors: MiniActivityValidationIssue[], record: MiniActivityRecord|null }}
 */
function normalizeMiniActivity(raw, ctx) {
  const now = ctx.now || new Date().toISOString();
  const existing = ctx.existing || null;
  const projectIds = new Set(ctx.workspaceProjectIds || []);

  /** @type {MiniActivityValidationIssue[]} */
  const errors = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      code: "mini_activity_invalid",
      message: "miniActivity deve ser um objeto.",
      field: "miniActivities",
    });
    return { ok: false, errors, record: null };
  }

  const miniActivityId =
    raw.miniActivityId != null && String(raw.miniActivityId).trim()
      ? String(raw.miniActivityId).trim()
      : existing
        ? existing.miniActivityId
        : "";
  if (!miniActivityId) {
    errors.push({
      code: "mini_activity_id_required",
      message: "miniActivityId é obrigatório.",
      field: "miniActivityId",
    });
  }

  let order = raw.order !== undefined ? Number(raw.order) : existing ? existing.order : NaN;
  if (!Number.isFinite(order) || !Number.isInteger(order)) {
    errors.push({
      code: "mini_activity_order_invalid",
      message: "order deve ser um número inteiro.",
      field: "order",
      miniActivityId: miniActivityId || undefined,
    });
    order = existing ? existing.order : 0;
  }

  const title =
    raw.title !== undefined
      ? String(raw.title).trim()
      : existing
        ? existing.title
        : "";
  if (!title) {
    errors.push({
      code: "mini_activity_title_required",
      message: "title é obrigatório.",
      field: "title",
      miniActivityId: miniActivityId || undefined,
    });
  }

  const description =
    raw.description !== undefined
      ? raw.description != null && String(raw.description).trim()
        ? String(raw.description).trim()
        : null
      : existing
        ? existing.description
        : null;

  const targetProjectId =
    raw.targetProjectId !== undefined
      ? String(raw.targetProjectId).trim()
      : existing
        ? existing.targetProjectId
        : "";
  if (!targetProjectId) {
    errors.push({
      code: "mini_activity_target_project_required",
      message: "targetProjectId é obrigatório.",
      field: "targetProjectId",
      miniActivityId: miniActivityId || undefined,
    });
  } else if (projectIds.size > 0 && !projectIds.has(targetProjectId)) {
    errors.push({
      code: "mini_activity_target_project_not_in_workspace",
      message: `targetProjectId não pertence ao workspace: ${targetProjectId}`,
      field: "targetProjectId",
      miniActivityId: miniActivityId || undefined,
    });
  }

  const statusRaw =
    raw.status !== undefined
      ? String(raw.status).trim()
      : existing
        ? existing.status
        : "pending";
  const status = statusRaw || "pending";
  if (!MINI_ACTIVITY_STATUSES.includes(status)) {
    errors.push({
      code: "mini_activity_status_invalid",
      message: `Status inválido: ${status}`,
      field: "status",
      miniActivityId: miniActivityId || undefined,
    });
  }

  let runId = null;
  if (raw.runId !== undefined) {
    runId = raw.runId != null && String(raw.runId).trim() ? String(raw.runId).trim() : null;
  } else if (existing) {
    runId = existing.runId;
  }

  const dependsOnMiniActivityIds = normalizeDependsOn(
    raw.dependsOnMiniActivityIds !== undefined
      ? raw.dependsOnMiniActivityIds
      : existing
        ? existing.dependsOnMiniActivityIds
        : [],
  );

  if (miniActivityId && dependsOnMiniActivityIds.includes(miniActivityId)) {
    errors.push({
      code: "mini_activity_self_dependency",
      message: "miniActivity não pode depender de si mesma.",
      field: "dependsOnMiniActivityIds",
      miniActivityId,
    });
  }

  const createdAt = existing ? existing.createdAt : now;
  const updatedAt = now;

  if (errors.length > 0) {
    return { ok: false, errors, record: null };
  }

  return {
    ok: true,
    errors: [],
    record: {
      miniActivityId,
      order,
      title,
      description,
      targetProjectId,
      status: MINI_ACTIVITY_STATUSES.includes(status) ? status : "pending",
      runId,
      dependsOnMiniActivityIds,
      createdAt,
      updatedAt,
    },
  };
}

/**
 * @param {unknown} rawList
 * @param {{ workspaceProjectIds: string[] }} ctx
 */
function validateMiniActivitiesList(rawList, ctx) {
  /** @type {MiniActivityValidationIssue[]} */
  const errors = [];

  if (!Array.isArray(rawList)) {
    errors.push({
      code: "workspace_run_mini_activities_invalid",
      message: "miniActivities deve ser um array.",
      field: "miniActivities",
    });
    return { ok: false, errors, miniActivities: [] };
  }

  /** @type {MiniActivityRecord[]} */
  const miniActivities = [];
  const now = new Date().toISOString();

  for (let i = 0; i < rawList.length; i++) {
    const norm = normalizeMiniActivity(rawList[i], {
      workspaceProjectIds: ctx.workspaceProjectIds,
      now,
    });
    if (!norm.ok) {
      for (const e of norm.errors) {
        errors.push({ ...e, field: e.field || `miniActivities[${i}]` });
      }
      continue;
    }
    miniActivities.push(/** @type {MiniActivityRecord} */ (norm.record));
  }

  if (errors.length > 0) {
    return { ok: false, errors, miniActivities: [] };
  }

  const idSeen = new Set();
  const orderSeen = new Set();
  for (const m of miniActivities) {
    if (idSeen.has(m.miniActivityId)) {
      errors.push({
        code: "mini_activity_id_duplicate",
        message: `miniActivityId duplicado: ${m.miniActivityId}`,
        field: "miniActivities",
        miniActivityId: m.miniActivityId,
      });
    }
    idSeen.add(m.miniActivityId);

    if (orderSeen.has(m.order)) {
      errors.push({
        code: "mini_activity_order_duplicate",
        message: `order duplicado: ${m.order}`,
        field: "miniActivities",
        miniActivityId: m.miniActivityId,
      });
    }
    orderSeen.add(m.order);
  }

  const idSet = new Set(miniActivities.map((m) => m.miniActivityId));
  for (const m of miniActivities) {
    for (const dep of m.dependsOnMiniActivityIds) {
      if (!idSet.has(dep)) {
        errors.push({
          code: "mini_activity_dependency_not_found",
          message: `dependsOnMiniActivityId inexistente: ${dep}`,
          field: "dependsOnMiniActivityIds",
          miniActivityId: m.miniActivityId,
        });
      }
    }
  }

  if (hasMiniActivityDependencyCycle(miniActivities)) {
    errors.push({
      code: "mini_activity_dependency_cycle",
      message: "Dependências circulares entre miniActivities não são permitidas.",
      field: "miniActivities",
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    miniActivities: errors.length === 0 ? miniActivities : [],
  };
}

/**
 * @param {MiniActivityRecord[]} miniActivities
 * @param {string[]} [explicitChildRunIds]
 */
function deriveChildRunIds(miniActivities, explicitChildRunIds) {
  const set = new Set();
  for (const id of explicitChildRunIds || []) {
    const s = id != null ? String(id).trim() : "";
    if (s) set.add(s);
  }
  for (const m of miniActivities || []) {
    if (m && m.runId) set.add(m.runId);
  }
  return [...set];
}

module.exports = {
  MINI_ACTIVITY_STATUSES,
  normalizeDependsOn,
  normalizeMiniActivity,
  validateMiniActivitiesList,
  hasMiniActivityDependencyCycle,
  deriveChildRunIds,
};
