"use strict";

const crypto = require("crypto");

/**
 * @param {string} miniTaskId
 */
function workspaceMiniActivityId(miniTaskId) {
  const base = String(miniTaskId || "").trim();
  if (!base) return `ma_${crypto.randomBytes(4).toString("hex")}`;
  const slug = base.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return `ma_${slug}`;
}

/**
 * @param {unknown} raw
 */
function asStringList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || "").trim()).filter(Boolean);
}

/**
 * Converte miniTasks do OES em registos WorkspaceRun miniActivities.
 * @param {{
 *   oesArtifact: { miniTasks: object[] },
 *   workspaceProjectIds: string[],
 *   now?: string,
 * }} input
 */
function oesMiniTasksToWorkspaceMiniActivities(input) {
  const now = input.now || new Date().toISOString();
  const allowed = new Set(input.workspaceProjectIds || []);
  const sorted = [...(input.oesArtifact?.miniTasks || [])].sort(
    (a, b) => Number(a.order) - Number(b.order),
  );

  /** @type {object[]} */
  const miniActivities = [];
  const idMap = new Map();

  for (const mt of sorted) {
    const miniTaskId = String(mt.id || "").trim();
    const maId = workspaceMiniActivityId(miniTaskId);
    idMap.set(miniTaskId, maId);

    const projectId =
      mt.projectId != null && String(mt.projectId).trim()
        ? String(mt.projectId).trim()
        : null;
    if (projectId && allowed.size && !allowed.has(projectId)) {
      continue;
    }
    if (!projectId) {
      throw new Error(
        `OES miniTask sem projectId: ${miniTaskId || mt.title || "?"}`,
      );
    }

    miniActivities.push({
      miniActivityId: maId,
      order: Math.max(0, Number(mt.order) > 0 ? Number(mt.order) - 1 : miniActivities.length),
      title: String(mt.title || miniTaskId || "Etapa").trim(),
      description:
        mt.objective != null && String(mt.objective).trim()
          ? String(mt.objective).trim()
          : null,
      targetProjectId: projectId,
      status: "pending",
      runId: null,
      dependsOnMiniActivityIds: [],
      createdAt: now,
      updatedAt: now,
      _dependsOnMiniTaskIds: asStringList(mt.dependsOnIds),
    });
  }

  for (const ma of miniActivities) {
    const deps = asStringList(ma._dependsOnMiniTaskIds);
    ma.dependsOnMiniActivityIds = deps
      .map((tid) => idMap.get(tid))
      .filter(Boolean);
    delete ma._dependsOnMiniTaskIds;
  }

  return miniActivities;
}

module.exports = {
  workspaceMiniActivityId,
  oesMiniTasksToWorkspaceMiniActivities,
};
