"use strict";

const fs = require("fs");
const path = require("path");

/**
 * @param {string} outputDirAbs
 * @param {{
 *   workspaceRunId: string,
 *   workspaceId?: string,
 *   planningProjectId?: string,
 *   projectIds?: string[],
 * }} link
 */
function patchRunContextWorkspaceLink(outputDirAbs, link) {
  const root = path.resolve(String(outputDirAbs || ""));
  const fp = path.join(root, "run-context.json");
  if (!fs.existsSync(fp)) {
    return { ok: false, code: "run_context_missing" };
  }

  let ctx;
  try {
    ctx = JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return { ok: false, code: "run_context_invalid" };
  }
  if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) {
    return { ok: false, code: "run_context_invalid" };
  }

  const workspaceRunId = String(link.workspaceRunId || "").trim();
  if (!workspaceRunId) {
    return { ok: false, code: "workspace_run_id_required" };
  }

  const projectIds = Array.isArray(link.projectIds)
    ? link.projectIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  ctx.workspace = {
    workspaceRunId,
    workspaceId:
      link.workspaceId != null && String(link.workspaceId).trim()
        ? String(link.workspaceId).trim()
        : null,
    planningProjectId:
      link.planningProjectId != null && String(link.planningProjectId).trim()
        ? String(link.planningProjectId).trim()
        : null,
    projectIds,
    linkedAt: new Date().toISOString(),
  };

  fs.writeFileSync(fp, JSON.stringify(ctx, null, 2), "utf-8");
  return { ok: true };
}

module.exports = {
  patchRunContextWorkspaceLink,
};
