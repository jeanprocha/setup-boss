import type { SetupWorkspaceDto } from "@/lib/api/workspace-types";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";

export function resolveProjectsForWorkspace(
  workspace: SetupWorkspaceDto,
  projectsById: ReadonlyMap<string, ProjectSummaryDto>,
): ProjectSummaryDto[] {
  return (workspace.projectIds ?? [])
    .map((id) => projectsById.get(id))
    .filter((p): p is ProjectSummaryDto => Boolean(p));
}

export function projectsByIdMap(
  projects: readonly ProjectSummaryDto[],
): Map<string, ProjectSummaryDto> {
  const map = new Map<string, ProjectSummaryDto>();
  for (const p of projects) {
    map.set(p.id, p);
  }
  return map;
}
