"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchRuntimeProjects } from "@/lib/api/runtime-api";
import { mapApiProjectToSummary } from "@/lib/runtime/adapters/map-project";
import { filterOperationalProjects } from "@/lib/projects/filter-operational-projects";
import { missionQueryStableOptions } from "@/lib/runtime/polling/mission-query-stable";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import {
  readCachedProjects,
  writeCachedProjects,
} from "@/lib/runtime/shell/mission-sidebar-cache";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";

export type ProjectsQueryResult = {
  projects: ProjectSummaryDto[];
  source: "runtime" | "offline" | "error";
  /** Presente quando `source === "error"` */
  errorMessage?: string;
};

export function useProjects() {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  return useQuery({
    queryKey: runtimeQueryKeys.projects(),
    initialData: () => readCachedProjects(),
    queryFn: async (): Promise<ProjectsQueryResult> => {
      if (!reachable) {
        return { projects: [], source: "offline" };
      }
      try {
        const rows = await fetchRuntimeProjects();
        const operational = filterOperationalProjects(
          rows.map((r) => ({
            projectId: String(r.projectId),
            projectRoot: r.projectRoot != null ? String(r.projectRoot) : null,
            displayName: r.displayName != null ? String(r.displayName) : null,
          })),
        );
        const allowed = new Set(operational.map((r) => r.projectId));
        const projects = rows
          .filter((r) => allowed.has(String(r.projectId)))
          .map(mapApiProjectToSummary);

        const result: ProjectsQueryResult = {
          projects,
          source: "runtime",
        };
        writeCachedProjects(result);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(msg);
      }
    },
    staleTime: 20_000,
    retry: 1,
    ...missionQueryStableOptions,
    refetchInterval: () => {
      const s = useRuntimeConnectionStore.getState();
      if (!s.connection.reachable) return false;
      return 25_000;
    },
  });
}
