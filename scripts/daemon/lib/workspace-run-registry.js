"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDaemonDirs } = require("./daemon-paths");
const { getWorkspace } = require("./workspace-registry");
const { validateWorkspaceRunFields } = require("../../../core/validate-workspace-run");
const { normalizeMiniActivity } = require("../../../core/validate-mini-activity");
const { normalizeWorkspaceGit } = require("../../../core/validate-workspace-git");

const WORKSPACE_RUN_SCHEMA = 1;

/** @typedef {import("../../../core/validate-mini-activity").MiniActivityRecord} MiniActivityRecord */

/** @typedef {{ workspaceRunId: string, workspaceId: string, title: string, description?: string|null, status: string, globalSpec?: unknown, globalPlan?: unknown, miniActivities: MiniActivityRecord[], childRunIds: string[], git?: import("../../../core/validate-workspace-git").object|null, createdAt: string, updatedAt: string }} WorkspaceRunRecord */

/** @typedef {{ schemaVersion: number, workspaceRuns: WorkspaceRunRecord[] }} WorkspaceRunsIndexFile */

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
}

function isoNow() {
  return new Date().toISOString();
}

function atomicWriteJson(absPath, data) {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${absPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, absPath);
}

/** @returns {WorkspaceRunsIndexFile} */
function defaultWorkspaceRunsPayload() {
  return { schemaVersion: WORKSPACE_RUN_SCHEMA, workspaceRuns: [] };
}

/** @returns {WorkspaceRunsIndexFile} */
function loadWorkspaceRunsUnsafe() {
  const { workspaceRunsIndexPath } = getDaemonDirs();
  if (!fs.existsSync(workspaceRunsIndexPath)) return defaultWorkspaceRunsPayload();
  try {
    const parsed = JSON.parse(fs.readFileSync(workspaceRunsIndexPath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.workspaceRuns))
      return defaultWorkspaceRunsPayload();
    parsed.schemaVersion = WORKSPACE_RUN_SCHEMA;
    return /** @type {WorkspaceRunsIndexFile} */ (parsed);
  } catch (_) {
    return defaultWorkspaceRunsPayload();
  }
}

/** @param {WorkspaceRunsIndexFile} data */
function saveWorkspaceRuns(data) {
  atomicWriteJson(getDaemonDirs().workspaceRunsIndexPath, data);
}

/**
 * @param {string} title
 * @param {WorkspaceRunRecord[]} existing
 */
function newWorkspaceRunId(title, existing) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const slug = slugify(title) || "activity";
  const base = `wsrun_${stamp}-${slug}`;
  const ids = new Set((existing || []).map((r) => r && r.workspaceRunId).filter(Boolean));
  if (!ids.has(base)) return base;
  const suffix = crypto.randomBytes(2).toString("hex");
  return `${base}-${suffix}`;
}

/** @param {WorkspaceRunRecord} row */
function toPublicWorkspaceRun(row) {
  return {
    workspaceRunId: row.workspaceRunId,
    workspaceId: row.workspaceId,
    title: row.title,
    description: row.description != null ? row.description : null,
    status: row.status,
    globalSpec: row.globalSpec != null ? row.globalSpec : null,
    globalPlan: row.globalPlan != null ? row.globalPlan : null,
    miniActivities: Array.isArray(row.miniActivities)
      ? row.miniActivities.map((m) => ({ ...m }))
      : [],
    childRunIds: Array.isArray(row.childRunIds) ? [...row.childRunIds] : [],
    git: normalizeWorkspaceGit(row.git),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {object} input
 * @returns {{ ok: true, workspaceRun: ReturnType<typeof toPublicWorkspaceRun> } | { ok: false, errors: import("../../../core/validate-workspace-run").WorkspaceRunValidationIssue[] }}
 */
function createWorkspaceRun(input) {
  const validated = validateWorkspaceRunFields(input, {
    findWorkspace: (id) => getWorkspace(id),
    isCreate: true,
  });
  if (!validated.ok) return { ok: false, errors: validated.errors };

  const payload = loadWorkspaceRunsUnsafe();
  const now = isoNow();
  /** @type {WorkspaceRunRecord} */
  const row = {
    workspaceRunId: newWorkspaceRunId(validated.title, payload.workspaceRuns),
    workspaceId: validated.workspaceId,
    title: validated.title,
    description: validated.description,
    status: validated.status,
    globalSpec: validated.globalSpec,
    globalPlan: validated.globalPlan,
    miniActivities: validated.miniActivities,
    childRunIds: validated.childRunIds,
    git: null,
    createdAt: now,
    updatedAt: now,
  };
  payload.workspaceRuns.push(row);
  saveWorkspaceRuns(payload);
  return { ok: true, workspaceRun: toPublicWorkspaceRun(row) };
}

/**
 * @param {{ workspaceId?: string|null }} [filter]
 * @returns {ReturnType<typeof toPublicWorkspaceRun>[]}
 */
function listWorkspaceRuns(filter = {}) {
  const wsFilter =
    filter && filter.workspaceId != null ? String(filter.workspaceId).trim() : "";
  const rows = loadWorkspaceRunsUnsafe().workspaceRuns.map(toPublicWorkspaceRun);
  if (!wsFilter) return rows;
  return rows.filter((r) => r.workspaceId === wsFilter);
}

/**
 * @param {string} workspaceRunId
 * @returns {ReturnType<typeof toPublicWorkspaceRun>|null}
 */
function getWorkspaceRun(workspaceRunId) {
  const id = workspaceRunId != null ? String(workspaceRunId).trim() : "";
  if (!id) return null;
  const row = loadWorkspaceRunsUnsafe().workspaceRuns.find(
    (r) => r && r.workspaceRunId === id,
  );
  return row ? toPublicWorkspaceRun(row) : null;
}

/**
 * @param {string} workspaceRunId
 * @param {object} patch
 */
function updateWorkspaceRun(workspaceRunId, patch) {
  const id = workspaceRunId != null ? String(workspaceRunId).trim() : "";
  if (!id) return { ok: false, code: "invalid_request", message: "workspaceRunId inválido." };

  const payload = loadWorkspaceRunsUnsafe();
  const idx = payload.workspaceRuns.findIndex((r) => r && r.workspaceRunId === id);
  if (idx < 0) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${id}` };
  }

  const current = payload.workspaceRuns[idx];
  const merged = {
    workspaceId: current.workspaceId,
    title: patch && patch.title !== undefined ? patch.title : current.title,
    description:
      patch && patch.description !== undefined ? patch.description : current.description,
    status: patch && patch.status !== undefined ? patch.status : current.status,
    globalSpec:
      patch && patch.globalSpec !== undefined ? patch.globalSpec : current.globalSpec,
    globalPlan:
      patch && patch.globalPlan !== undefined ? patch.globalPlan : current.globalPlan,
    miniActivities:
      patch && patch.miniActivities !== undefined
        ? patch.miniActivities
        : current.miniActivities,
    childRunIds:
      patch && patch.childRunIds !== undefined ? patch.childRunIds : current.childRunIds,
    git: patch && patch.git !== undefined ? patch.git : current.git,
  };

  const validated = validateWorkspaceRunFields(merged, {
    findWorkspace: (wsId) => getWorkspace(wsId),
  });
  if (!validated.ok) return { ok: false, errors: validated.errors };

  /** @type {WorkspaceRunRecord} */
  const next = {
    ...current,
    title: validated.title,
    description: validated.description,
    status: validated.status,
    globalSpec: validated.globalSpec,
    globalPlan: validated.globalPlan,
    miniActivities: validated.miniActivities,
    childRunIds: validated.childRunIds,
    git: normalizeWorkspaceGit(merged.git),
    updatedAt: isoNow(),
  };
  payload.workspaceRuns[idx] = next;
  saveWorkspaceRuns(payload);
  return { ok: true, workspaceRun: toPublicWorkspaceRun(next) };
}

/**
 * @param {string} workspaceRunId
 */
function newMiniActivityId() {
  const h = crypto.randomBytes(4).toString("hex");
  return `ma_${h}`;
}

/**
 * @param {MiniActivityRecord[]} list
 */
function nextMiniActivityOrder(list) {
  let max = -1;
  for (const m of list || []) {
    if (m && Number.isInteger(m.order) && m.order > max) max = m.order;
  }
  return max + 1;
}

/**
 * @param {string} workspaceRunId
 * @param {object} input
 */
function addMiniActivity(workspaceRunId, input) {
  const id = workspaceRunId != null ? String(workspaceRunId).trim() : "";
  if (!id) return { ok: false, code: "invalid_request", message: "workspaceRunId inválido." };

  const current = getWorkspaceRun(id);
  if (!current) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${id}` };
  }

  const ws = getWorkspace(current.workspaceId);
  const projectIds = ws && Array.isArray(ws.projectIds) ? ws.projectIds : [];
  const now = isoNow();
  const order =
    input && input.order !== undefined
      ? input.order
      : nextMiniActivityOrder(current.miniActivities);

  const norm = normalizeMiniActivity(
    {
      ...input,
      miniActivityId:
        input && input.miniActivityId != null && String(input.miniActivityId).trim()
          ? input.miniActivityId
          : newMiniActivityId(),
      order,
    },
    { workspaceProjectIds: projectIds, now },
  );
  if (!norm.ok) return { ok: false, errors: norm.errors };

  const nextList = [...current.miniActivities, norm.record];
  return updateWorkspaceRun(id, { miniActivities: nextList });
}

/**
 * @param {string} workspaceRunId
 * @param {string} miniActivityId
 * @param {object} patch
 */
function updateMiniActivity(workspaceRunId, miniActivityId, patch) {
  const runId = workspaceRunId != null ? String(workspaceRunId).trim() : "";
  const maId = miniActivityId != null ? String(miniActivityId).trim() : "";
  if (!runId || !maId) {
    return { ok: false, code: "invalid_request", message: "workspaceRunId ou miniActivityId inválido." };
  }

  const current = getWorkspaceRun(runId);
  if (!current) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${runId}` };
  }

  const idx = current.miniActivities.findIndex((m) => m && m.miniActivityId === maId);
  if (idx < 0) {
    return {
      ok: false,
      code: "not_found",
      message: `miniActivity não encontrada: ${maId}`,
    };
  }

  const ws = getWorkspace(current.workspaceId);
  const projectIds = ws && Array.isArray(ws.projectIds) ? ws.projectIds : [];
  const existing = current.miniActivities[idx];
  const norm = normalizeMiniActivity(
    { ...existing, ...patch, miniActivityId: maId },
    { workspaceProjectIds: projectIds, existing, now: isoNow() },
  );
  if (!norm.ok) return { ok: false, errors: norm.errors };

  const nextList = current.miniActivities.map((m, i) => (i === idx ? norm.record : m));
  return updateWorkspaceRun(runId, { miniActivities: nextList });
}

/**
 * @param {string} workspaceRunId
 * @param {string} miniActivityId
 */
function deleteMiniActivity(workspaceRunId, miniActivityId) {
  const runId = workspaceRunId != null ? String(workspaceRunId).trim() : "";
  const maId = miniActivityId != null ? String(miniActivityId).trim() : "";
  if (!runId || !maId) {
    return { ok: false, code: "invalid_request", message: "workspaceRunId ou miniActivityId inválido." };
  }

  const current = getWorkspaceRun(runId);
  if (!current) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${runId}` };
  }

  if (!current.miniActivities.some((m) => m && m.miniActivityId === maId)) {
    return {
      ok: false,
      code: "not_found",
      message: `miniActivity não encontrada: ${maId}`,
    };
  }

  const nextList = current.miniActivities.filter((m) => m && m.miniActivityId !== maId);
  return updateWorkspaceRun(runId, { miniActivities: nextList });
}

function deleteWorkspaceRun(workspaceRunId) {
  const id = workspaceRunId != null ? String(workspaceRunId).trim() : "";
  if (!id) return { ok: false, code: "invalid_request", message: "workspaceRunId inválido." };

  const payload = loadWorkspaceRunsUnsafe();
  const before = payload.workspaceRuns.length;
  payload.workspaceRuns = payload.workspaceRuns.filter((r) => r && r.workspaceRunId !== id);
  if (payload.workspaceRuns.length === before) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${id}` };
  }
  saveWorkspaceRuns(payload);
  return { ok: true, removed: true };
}

module.exports = {
  WORKSPACE_RUN_SCHEMA,
  loadWorkspaceRunsUnsafe,
  saveWorkspaceRuns,
  createWorkspaceRun,
  listWorkspaceRuns,
  getWorkspaceRun,
  updateWorkspaceRun,
  deleteWorkspaceRun,
  addMiniActivity,
  updateMiniActivity,
  deleteMiniActivity,
  toPublicWorkspaceRun,
  newWorkspaceRunId,
  newMiniActivityId,
};
