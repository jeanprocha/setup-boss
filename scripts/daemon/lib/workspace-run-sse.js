"use strict";

const { getWorkspaceRun } = require("./workspace-run-registry");

/** Eventos SSE públicos (Fase I). */
const WORKSPACE_RUN_SSE_EVENT_TYPES = new Set([
  "workspace_run.updated",
  "workspace_run.started",
  "workspace_run.advanced",
  "workspace_run.waiting_user_action",
  "workspace_run.failed",
  "workspace_run.completed",
  "workspace_run.git_updated",
  "workspace_run.error",
]);

/** @type {Set<(payload: WorkspaceRunSsePayload) => void>} */
const listeners = new Set();

/**
 * @typedef {{
 *   workspaceRunId: string,
 *   workspaceId: string,
 *   status: string,
 *   eventType: string,
 *   timestamp: string,
 *   miniActivityId?: string|null,
 *   runId?: string|null,
 *   projectId?: string|null,
 *   message?: string|null,
 * }} WorkspaceRunSsePayload
 */

/**
 * @param {(payload: WorkspaceRunSsePayload) => void} fn
 * @returns {() => void}
 */
function subscribeWorkspaceRunSseListener(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => {
    try {
      listeners.delete(fn);
    } catch (_) {
      /* */
    }
  };
}

/**
 * @param {string} eventType
 * @param {Partial<WorkspaceRunSsePayload> & { workspaceRunId: string }} partial
 */
function emitWorkspaceRunSse(eventType, partial) {
  const type = String(eventType || "").trim();
  if (!WORKSPACE_RUN_SSE_EVENT_TYPES.has(type)) return;

  const workspaceRunId = String(partial.workspaceRunId || "").trim();
  if (!workspaceRunId) return;

  /** @type {WorkspaceRunSsePayload} */
  const payload = {
    workspaceRunId,
    workspaceId: String(partial.workspaceId || "").trim(),
    status: String(partial.status || "").trim(),
    eventType: type,
    timestamp: partial.timestamp || new Date().toISOString(),
    miniActivityId:
      partial.miniActivityId != null ? String(partial.miniActivityId) : null,
    runId: partial.runId != null ? String(partial.runId) : null,
    projectId: partial.projectId != null ? String(partial.projectId) : null,
    message: partial.message != null ? String(partial.message) : null,
  };

  for (const fn of listeners) {
    try {
      fn(payload);
    } catch (_) {
      /* listener isolado */
    }
  }
}

/**
 * Carrega WorkspaceRun e emite SSE com payload mínimo.
 * @param {string} eventType
 * @param {string} workspaceRunId
 * @param {Omit<Partial<WorkspaceRunSsePayload>, "workspaceRunId"|"eventType"|"timestamp"> & { message?: string|null }} [extras]
 */
function notifyWorkspaceRunSse(eventType, workspaceRunId, extras = {}) {
  const id = String(workspaceRunId || "").trim();
  if (!id) return;

  const row = getWorkspaceRun(id);
  if (!row) {
    emitWorkspaceRunSse(eventType, {
      workspaceRunId: id,
      workspaceId: extras.workspaceId ? String(extras.workspaceId) : "",
      status: extras.status ? String(extras.status) : "",
      ...extras,
    });
    return;
  }

  emitWorkspaceRunSse(eventType, {
    workspaceRunId: row.workspaceRunId,
    workspaceId: row.workspaceId,
    status: row.status,
    miniActivityId: extras.miniActivityId ?? null,
    runId: extras.runId ?? null,
    projectId: extras.projectId ?? null,
    message: extras.message ?? null,
    ...extras,
  });
}

module.exports = {
  WORKSPACE_RUN_SSE_EVENT_TYPES,
  subscribeWorkspaceRunSseListener,
  emitWorkspaceRunSse,
  notifyWorkspaceRunSse,
};
