"use strict";

/**
 * Parser de WorkspaceRun.globalSpec (v1) — espelho do contrato frontend.
 * @param {unknown} raw
 * @returns {{
 *   schemaVersion: 1,
 *   task: string,
 *   projectIds: string[],
 *   source?: string,
 *   priority?: string,
 *   createdAt?: string,
 *   planningRunId?: string,
 *   planningProjectId?: string,
 * } | null}
 */
function parseWorkspaceGlobalSpec(raw) {
  if (raw == null) return null;
  let obj;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      obj = JSON.parse(t);
    } catch {
      return {
        schemaVersion: 1,
        task: t,
        projectIds: [],
        source: "legacy_markdown",
      };
    }
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw;
  } else {
    return null;
  }

  const task =
    typeof obj.task === "string"
      ? obj.task.trim()
      : typeof obj.description === "string"
        ? obj.description.trim()
        : "";
  if (!task) return null;

  const projectIds = Array.isArray(obj.projectIds)
    ? obj.projectIds
        .map((id) => (id != null ? String(id).trim() : ""))
        .filter(Boolean)
    : [];

  const planningRunId =
    typeof obj.planningRunId === "string" ? obj.planningRunId.trim() : undefined;
  const planningProjectId =
    typeof obj.planningProjectId === "string"
      ? obj.planningProjectId.trim()
      : undefined;

  return {
    schemaVersion: 1,
    task,
    projectIds,
    source: typeof obj.source === "string" ? obj.source : undefined,
    priority: typeof obj.priority === "string" ? obj.priority : undefined,
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : undefined,
    planningRunId: planningRunId || undefined,
    planningProjectId: planningProjectId || undefined,
  };
}

module.exports = {
  parseWorkspaceGlobalSpec,
};
