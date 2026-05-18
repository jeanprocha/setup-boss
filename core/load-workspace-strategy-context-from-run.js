"use strict";

const path = require("path");
const fs = require("fs");

const { buildWorkspaceStrategyContextFromRun } = require("./workspace-strategy-context");

/**
 * @param {string} fp
 */
function readJsonObject(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDirAbs
 * @param {{
 *   getWorkspaceRun: (id: string) => object|null,
 *   resolveProject?: (id: string) => object|null,
 * }} deps
 */
function loadWorkspaceStrategyContextFromPlanningRun(outputDirAbs, deps) {
  const ctx = readJsonObject(path.join(outputDirAbs, "run-context.json"));
  const wsBlock =
    ctx && ctx.workspace && typeof ctx.workspace === "object"
      ? ctx.workspace
      : null;
  const workspaceRunId =
    wsBlock && wsBlock.workspaceRunId != null
      ? String(wsBlock.workspaceRunId).trim()
      : "";
  if (!workspaceRunId) {
    return { ok: false, code: "not_workspace_planning_run" };
  }

  const row = deps.getWorkspaceRun(workspaceRunId);
  if (!row) {
    return { ok: false, code: "workspace_run_not_found" };
  }

  return buildWorkspaceStrategyContextFromRun(row, deps.resolveProject || (() => null));
}

module.exports = {
  loadWorkspaceStrategyContextFromPlanningRun,
};
