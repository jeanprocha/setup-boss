import type { MiniActivityDto } from "@/lib/api/mini-activity-types";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";

export type WorkspaceMiniVisualState =
  | "pending"
  | "ready"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "skipped";

const STATUS_LABELS: Record<WorkspaceMiniVisualState, string> = {
  pending: "Pendente",
  ready: "Pronta",
  running: "Em execução",
  waiting: "Aguarda ação",
  completed: "Concluída",
  failed: "Falhou",
  skipped: "Ignorada",
};

export function resolveWorkspaceMiniVisualState(
  ma: MiniActivityDto,
): WorkspaceMiniVisualState {
  switch (ma.status) {
    case "running":
      return "running";
    case "waiting_user_action":
      return "waiting";
    case "completed":
      return "completed";
    case "failed":
    case "cancelled":
      return "failed";
    case "skipped":
      return "skipped";
    case "ready":
      return "ready";
    default:
      return "pending";
  }
}

export function labelWorkspaceMiniVisualState(state: WorkspaceMiniVisualState): string {
  return STATUS_LABELS[state] ?? "Pendente";
}

export function projectDisplayName(
  projectId: string,
  projectsById: Map<string, ProjectSummaryDto>,
): string {
  return projectsById.get(projectId)?.displayName?.trim() || projectId;
}

export function groupMiniActivitiesByProject(
  miniActivities: MiniActivityDto[],
): Map<string, MiniActivityDto[]> {
  const sorted = [...miniActivities].sort((a, b) => a.order - b.order);
  const groups = new Map<string, MiniActivityDto[]>();
  for (const ma of sorted) {
    const list = groups.get(ma.targetProjectId) ?? [];
    list.push(ma);
    groups.set(ma.targetProjectId, list);
  }
  return groups;
}

export function dependencyStepLabels(
  mini: MiniActivityDto,
  orderById: Map<string, number>,
): string[] {
  return (mini.dependsOnMiniActivityIds ?? [])
    .map((id) => orderById.get(id))
    .filter((n): n is number => typeof n === "number")
    .map((n) => `etapa ${n}`);
}

export function findActiveWorkspaceMiniId(
  miniActivities: MiniActivityDto[],
): string | null {
  const running = miniActivities.find((m) => m.status === "running");
  if (running) return running.miniActivityId;
  const waiting = miniActivities.find((m) => m.status === "waiting_user_action");
  if (waiting) return waiting.miniActivityId;
  const next = [...miniActivities]
    .sort((a, b) => a.order - b.order)
    .find((m) => m.status === "pending" || m.status === "ready");
  return next?.miniActivityId ?? null;
}
