import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ProjectsQueryResult } from "@/hooks/use-projects";
import type { RunsQueryResult } from "@/hooks/use-runs";

const PROJECTS_KEY = "setup-boss:sidebar:projects:v1";
const runsKey = (projectId: string, includeArchived: boolean) =>
  `setup-boss:sidebar:runs:v1:${projectId}:${includeArchived ? "arch" : "live"}`;

function hasSessionStorage(): boolean {
  return typeof sessionStorage !== "undefined";
}

function readJson<T>(key: string): T | undefined {
  if (!hasSessionStorage()) return undefined;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!hasSessionStorage()) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function removeJson(key: string): void {
  if (!hasSessionStorage()) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* quota */
  }
}

export function readCachedProjects(): ProjectsQueryResult | undefined {
  const row = readJson<{ savedAt: number; data: ProjectsQueryResult }>(
    PROJECTS_KEY,
  );
  if (!row?.data?.projects?.length) return undefined;
  return row.data;
}

export function writeCachedProjects(data: ProjectsQueryResult): void {
  writeJson(PROJECTS_KEY, { savedAt: Date.now(), data });
}

export function readCachedProjectRuns(
  projectId: string,
  includeArchived: boolean,
): RunsQueryResult | undefined {
  const row = readJson<{ savedAt: number; data: RunsQueryResult }>(
    runsKey(projectId, includeArchived),
  );
  if (!row?.data) return undefined;
  return row.data;
}

export function writeCachedProjectRuns(
  projectId: string,
  includeArchived: boolean,
  data: RunsQueryResult,
): void {
  if (!data.summaries.length) return;
  writeJson(runsKey(projectId, includeArchived), {
    savedAt: Date.now(),
    data,
  });
}

export function clearCachedProjectRuns(
  projectId: string,
  includeArchived: boolean,
): void {
  removeJson(runsKey(projectId, includeArchived));
}

/** Mescla cache + fetch para mostrar atividades antigas enquanto refetch corre. */
export function mergeRunsWithCache(
  projectId: string,
  includeArchived: boolean,
  fresh: RunsQueryResult,
): RunsQueryResult {
  if (fresh.source === "runtime") {
    if (fresh.summaries.length > 0) {
      writeCachedProjectRuns(projectId, includeArchived, fresh);
      return fresh;
    }
    clearCachedProjectRuns(projectId, includeArchived);
    return fresh;
  }
  const cached = readCachedProjectRuns(projectId, includeArchived);
  if (cached?.summaries.length && fresh.summaries.length === 0) {
    return {
      ...cached,
      source: cached.source === "runtime" ? "runtime" : fresh.source,
    };
  }
  return fresh;
}

export type SidebarActivityPreview = {
  projectId: string;
  summaries: RunSummaryDto[];
};
