"use strict";

const fs = require("fs");
const { resolveRunIndexPath } = require("../../../core/run-resolver");
const { deriveChildRunIds } = require("../../../core/validate-mini-activity");
const {
  loadWorkspaceRunsUnsafe,
  saveWorkspaceRuns,
  getWorkspaceRun,
} = require("./workspace-run-registry");
const { recoverStaleWorkspaceRunLocksOnDisk } = require("./workspace-run-lock");
const { appendDaemonLog } = require("./daemon-log");

const ACTIVE_WORKSPACE_STATUSES = new Set([
  "running",
  "waiting_user_action",
  "failed",
]);

/**
 * @param {import("../../../core/validate-mini-activity").MiniActivityRecord[]} miniActivities
 * @returns {string|null}
 */
function deriveAggregatedWorkspaceRunStatus(miniActivities) {
  if (!miniActivities || miniActivities.length === 0) return null;
  const statuses = miniActivities.map((m) => String(m && m.status));

  if (statuses.every((s) => s === "completed" || s === "skipped")) {
    return "completed";
  }
  if (statuses.some((s) => s === "waiting_user_action")) {
    return "waiting_user_action";
  }
  if (statuses.some((s) => s === "failed")) {
    if (statuses.some((s) => s === "running")) return "running";
    return "failed";
  }
  if (statuses.some((s) => s === "running")) return "running";
  if (
    statuses.some((s) => s === "completed" || s === "skipped") &&
    statuses.some((s) => s === "pending" || s === "ready")
  ) {
    return "running";
  }
  return null;
}

/**
 * @param {string|null|undefined} runId
 */
function childRunIndexExists(runId) {
  const rid = runId != null ? String(runId).trim() : "";
  if (!rid) return false;
  try {
    return fs.existsSync(resolveRunIndexPath(rid));
  } catch (_) {
    return false;
  }
}

/**
 * @param {import("../../../core/validate-mini-activity").MiniActivityRecord[]} miniActivities
 * @param {{ repairOrphanRunIds?: boolean }} [opts]
 * @returns {{ miniActivities: import("../../../core/validate-mini-activity").MiniActivityRecord[], changed: boolean, fixes: string[] }}
 */
function reconcileMiniActivities(miniActivities, opts = {}) {
  const repairOrphanRunIds = opts.repairOrphanRunIds === true;
  const fixes = [];
  let changed = false;
  const now = new Date().toISOString();

  const next = (miniActivities || []).map((m) => {
    if (!m) return m;
    let status = String(m.status || "");
    let runId = m.runId != null ? String(m.runId).trim() : null;
    let patch = /** @type {Partial<typeof m>|null} */ (null);

    if (status === "running" && !runId) {
      patch = { status: "ready", runId: null };
      fixes.push(`mini ${m.miniActivityId}: running_sem_runId→ready`);
    } else if (
      repairOrphanRunIds &&
      (status === "running" || status === "waiting_user_action") &&
      runId &&
      !childRunIndexExists(runId)
    ) {
      patch = { status: "failed", runId };
      fixes.push(`mini ${m.miniActivityId}: runId_orfao→failed`);
    } else if (status === "waiting_user_action" && !runId) {
      patch = { status: "failed", runId: null };
      fixes.push(`mini ${m.miniActivityId}: waiting_sem_runId→failed`);
    }

    if (!patch) return m;
    changed = true;
    return { ...m, ...patch, updatedAt: now };
  });

  return { miniActivities: next, changed, fixes };
}

/**
 * @param {import("./workspace-run-registry").WorkspaceRunRecord} row
 * @param {{ repairOrphanRunIds?: boolean }} [opts]
 * @returns {{ row: import("./workspace-run-registry").WorkspaceRunRecord, changed: boolean, fixes: string[] }}
 */
function reconcileWorkspaceRunRow(row, opts = {}) {
  const fixes = [];
  let changed = false;
  let miniActivities = Array.isArray(row.miniActivities) ? [...row.miniActivities] : [];

  const miniResult = reconcileMiniActivities(miniActivities, opts);
  if (miniResult.changed) {
    miniActivities = miniResult.miniActivities;
    changed = true;
    fixes.push(...miniResult.fixes);
  }

  const derivedChildRunIds = deriveChildRunIds(miniActivities, row.childRunIds || []);
  const prevChild = JSON.stringify(row.childRunIds || []);
  const nextChild = JSON.stringify(derivedChildRunIds);
  if (prevChild !== nextChild) {
    changed = true;
    fixes.push("childRunIds_sincronizado");
  }

  const aggregated = deriveAggregatedWorkspaceRunStatus(miniActivities);
  let status = String(row.status || "");
  if (
    aggregated &&
    ACTIVE_WORKSPACE_STATUSES.has(status) &&
    aggregated !== status
  ) {
    status = aggregated;
    changed = true;
    fixes.push(`status_agregado→${aggregated}`);
  }

  if (!changed) {
    return { row, changed: false, fixes };
  }

  return {
    row: {
      ...row,
      status,
      miniActivities,
      childRunIds: derivedChildRunIds,
      updatedAt: new Date().toISOString(),
    },
    changed: true,
    fixes,
  };
}

/**
 * @param {string} workspaceRunId
 * @param {{ repairOrphanRunIds?: boolean }} [opts]
 * @returns {{ ok: boolean, workspaceRun?: ReturnType<typeof getWorkspaceRun>, changed?: boolean, fixes?: string[] }}
 */
function reconcileWorkspaceRun(workspaceRunId, opts = {}) {
  const id = String(workspaceRunId || "").trim();
  if (!id) return { ok: false, code: "invalid_request" };

  const payload = loadWorkspaceRunsUnsafe();
  const idx = payload.workspaceRuns.findIndex((r) => r && r.workspaceRunId === id);
  if (idx < 0) return { ok: false, code: "not_found" };

  const result = reconcileWorkspaceRunRow(payload.workspaceRuns[idx], opts);
  if (!result.changed) {
    return { ok: true, workspaceRun: getWorkspaceRun(id), changed: false, fixes: [] };
  }

  payload.workspaceRuns[idx] = result.row;
  saveWorkspaceRuns(payload);
  appendDaemonLog(
    `workspace_run_reconcile workspaceRunId=${id} fixes=${result.fixes.join(",")}`,
  );
  return {
    ok: true,
    workspaceRun: getWorkspaceRun(id),
    changed: true,
    fixes: result.fixes,
  };
}

/**
 * @param {{ cap?: number }} [opts]
 */
function reconcileWorkspaceRunsOnBoot(opts = {}) {
  const cap = Number.isFinite(opts.cap) ? Math.max(1, opts.cap) : 200;
  recoverStaleWorkspaceRunLocksOnDisk();

  const payload = loadWorkspaceRunsUnsafe();
  let scanned = 0;
  let reconciled = 0;
  const allFixes = [];

  for (const row of payload.workspaceRuns) {
    if (!row || scanned >= cap) break;
    if (!ACTIVE_WORKSPACE_STATUSES.has(String(row.status))) continue;
    scanned += 1;
    const result = reconcileWorkspaceRunRow(row, { repairOrphanRunIds: true });
    if (!result.changed) continue;
    const idx = payload.workspaceRuns.findIndex(
      (r) => r && r.workspaceRunId === row.workspaceRunId,
    );
    if (idx < 0) continue;
    payload.workspaceRuns[idx] = result.row;
    reconciled += 1;
    allFixes.push(...result.fixes);
  }

  if (reconciled > 0) saveWorkspaceRuns(payload);

  return { scanned, reconciled, fixes: allFixes };
}

module.exports = {
  deriveAggregatedWorkspaceRunStatus,
  reconcileMiniActivities,
  reconcileWorkspaceRunRow,
  reconcileWorkspaceRun,
  reconcileWorkspaceRunsOnBoot,
  childRunIndexExists,
};
