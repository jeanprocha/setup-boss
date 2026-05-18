/**
 * Payload multi-projeto guardado em WorkspaceRun.globalSpec (v1).
 */

export type WorkspaceGlobalSpecV1 = {
  schemaVersion: 1;
  task: string;
  projectIds: string[];
  source?: string;
  priority?: string;
  createdAt?: string;
  /** Run de planeamento (intake → aprovação) no projeto coordenador. */
  planningRunId?: string;
  planningProjectId?: string;
};

export function buildWorkspaceGlobalSpec(input: {
  task: string;
  projectIds: string[];
  source?: string;
  priority?: string;
}): WorkspaceGlobalSpecV1 {
  return {
    schemaVersion: 1,
    task: input.task.trim(),
    projectIds: [...input.projectIds],
    source: input.source ?? "mission_control",
    priority: input.priority ?? "normal",
    createdAt: new Date().toISOString(),
  };
}

export function parseWorkspaceGlobalSpec(
  raw: string | Record<string, unknown> | null | undefined,
): WorkspaceGlobalSpecV1 | null {
  if (raw == null) return null;
  let obj: Record<string, unknown>;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      obj = JSON.parse(t) as Record<string, unknown>;
    } catch {
      return {
        schemaVersion: 1,
        task: t,
        projectIds: [],
        source: "legacy_markdown",
      };
    }
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
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

export function titleFromWorkspaceTask(task: string, maxLen = 120): string {
  const line = task.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (!line) return "Nova atividade";
  if (line.length <= maxLen) return line;
  return `${line.slice(0, maxLen - 1)}…`;
}
