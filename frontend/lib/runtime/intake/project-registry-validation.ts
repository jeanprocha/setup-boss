import type { ProjectSummaryDto } from "@/lib/api/runtime-types";

const PROJECT_NOT_FOUND_RE =
  /projeto\s+n[aã]o\s+encontrado|project\s+not\s+found/i;

export function isProjectInRegistry(
  projectId: string | null | undefined,
  projects: readonly ProjectSummaryDto[],
): boolean {
  if (!projectId) return false;
  return projects.some((p) => p.id === projectId);
}

export function isProjectNotFoundMessage(message: string): boolean {
  return PROJECT_NOT_FOUND_RE.test(message);
}

export function pickDefaultProjectId(
  projects: readonly ProjectSummaryDto[],
): string | null {
  return projects[0]?.id ?? null;
}

/** Evita GET /governance para projectId ausente do registry (ex.: stale localStorage). */
export function canFetchProjectGovernance(
  projectId: string | null,
  projects: readonly ProjectSummaryDto[],
  opts: { reachable: boolean; projectsReady: boolean },
): boolean {
  if (!opts.reachable || !opts.projectsReady || !projectId) return false;
  return isProjectInRegistry(projectId, projects);
}
