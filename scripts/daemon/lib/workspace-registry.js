"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDaemonDirs } = require("./daemon-paths");
const { findProjectRecord } = require("./project-registry");
const { validateWorkspaceFields } = require("../../../core/validate-workspace");

const WORKSPACE_SCHEMA = 1;

/** @typedef {{ workspaceId: string, name: string, description?: string|null, projectIds: string[], primaryProjectId?: string|null, createdAt: string, updatedAt: string }} WorkspaceRecord */

/** @typedef {{ schemaVersion: number, workspaces: WorkspaceRecord[] }} WorkspacesFile */

/** @returns {WorkspacesFile} */
function defaultWorkspacesPayload() {
  return { schemaVersion: WORKSPACE_SCHEMA, workspaces: [] };
}

function atomicWriteJson(absPath, data) {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${absPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, absPath);
}

/** @returns {WorkspacesFile} */
function loadWorkspacesUnsafe() {
  const { workspacesPath } = getDaemonDirs();
  if (!fs.existsSync(workspacesPath)) return defaultWorkspacesPayload();
  try {
    const parsed = JSON.parse(fs.readFileSync(workspacesPath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.workspaces))
      return defaultWorkspacesPayload();
    parsed.schemaVersion = WORKSPACE_SCHEMA;
    return /** @type {WorkspacesFile} */ (parsed);
  } catch (_) {
    return defaultWorkspacesPayload();
  }
}

/** @param {WorkspacesFile} data */
function saveWorkspaces(data) {
  atomicWriteJson(getDaemonDirs().workspacesPath, data);
}

function newWorkspaceId() {
  const h = crypto.randomBytes(4).toString("hex");
  return `ws_${h}`;
}

function isoNow() {
  return new Date().toISOString();
}

/** @param {WorkspaceRecord} row */
function toPublicWorkspace(row) {
  return {
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description != null ? row.description : null,
    projectIds: Array.isArray(row.projectIds) ? [...row.projectIds] : [],
    primaryProjectId: row.primaryProjectId != null ? row.primaryProjectId : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {object} input
 * @returns {{ ok: true, workspace: ReturnType<typeof toPublicWorkspace> } | { ok: false, errors: import("../../../core/validate-workspace").WorkspaceValidationIssue[] }}
 */
function createWorkspace(input) {
  const validated = validateWorkspaceFields(input, {
    findProject: (pid) => findProjectRecord(pid),
  });
  if (!validated.ok) return { ok: false, errors: validated.errors };

  const payload = loadWorkspacesUnsafe();
  const now = isoNow();
  /** @type {WorkspaceRecord} */
  const row = {
    workspaceId: newWorkspaceId(),
    name: validated.name,
    description: validated.description,
    projectIds: validated.projectIds,
    primaryProjectId: validated.primaryProjectId,
    createdAt: now,
    updatedAt: now,
  };
  payload.workspaces.push(row);
  saveWorkspaces(payload);
  return { ok: true, workspace: toPublicWorkspace(row) };
}

/** @returns {ReturnType<typeof toPublicWorkspace>[]} */
function listWorkspaces() {
  const payload = loadWorkspacesUnsafe();
  return payload.workspaces.map(toPublicWorkspace);
}

/**
 * @param {string} workspaceId
 * @returns {ReturnType<typeof toPublicWorkspace>|null}
 */
function getWorkspace(workspaceId) {
  const id = workspaceId != null ? String(workspaceId).trim() : "";
  if (!id) return null;
  const row = loadWorkspacesUnsafe().workspaces.find((w) => w && w.workspaceId === id);
  return row ? toPublicWorkspace(row) : null;
}

/**
 * @param {string} workspaceId
 * @param {object} patch
 * @returns {{ ok: true, workspace: ReturnType<typeof toPublicWorkspace> } | { ok: false, code?: string, message?: string, errors?: import("../../../core/validate-workspace").WorkspaceValidationIssue[] }}
 */
function updateWorkspace(workspaceId, patch) {
  const id = workspaceId != null ? String(workspaceId).trim() : "";
  if (!id) return { ok: false, code: "invalid_request", message: "workspaceId inválido." };

  const payload = loadWorkspacesUnsafe();
  const idx = payload.workspaces.findIndex((w) => w && w.workspaceId === id);
  if (idx < 0) return { ok: false, code: "not_found", message: `Workspace não encontrado: ${id}` };

  const current = payload.workspaces[idx];
  const merged = {
    name: patch && patch.name !== undefined ? patch.name : current.name,
    description:
      patch && patch.description !== undefined ? patch.description : current.description,
    projectIds:
      patch && patch.projectIds !== undefined ? patch.projectIds : current.projectIds,
    primaryProjectId:
      patch && patch.primaryProjectId !== undefined
        ? patch.primaryProjectId
        : current.primaryProjectId,
  };

  const validated = validateWorkspaceFields(merged, {
    findProject: (pid) => findProjectRecord(pid),
  });
  if (!validated.ok) return { ok: false, errors: validated.errors };

  /** @type {WorkspaceRecord} */
  const next = {
    ...current,
    name: validated.name,
    description: validated.description,
    projectIds: validated.projectIds,
    primaryProjectId: validated.primaryProjectId,
    updatedAt: isoNow(),
  };
  payload.workspaces[idx] = next;
  saveWorkspaces(payload);
  return { ok: true, workspace: toPublicWorkspace(next) };
}

/**
 * @param {string} workspaceId
 * @returns {{ ok: true, removed: boolean } | { ok: false, code: string, message: string }}
 */
function deleteWorkspace(workspaceId) {
  const id = workspaceId != null ? String(workspaceId).trim() : "";
  if (!id) return { ok: false, code: "invalid_request", message: "workspaceId inválido." };

  const payload = loadWorkspacesUnsafe();
  const before = payload.workspaces.length;
  payload.workspaces = payload.workspaces.filter((w) => w && w.workspaceId !== id);
  if (payload.workspaces.length === before) {
    return { ok: false, code: "not_found", message: `Workspace não encontrado: ${id}` };
  }
  saveWorkspaces(payload);
  return { ok: true, removed: true };
}

module.exports = {
  WORKSPACE_SCHEMA,
  loadWorkspacesUnsafe,
  saveWorkspaces,
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  toPublicWorkspace,
};
