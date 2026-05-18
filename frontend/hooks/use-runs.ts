"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchRuntimeProjectRecentJobs } from "@/lib/api/runtime-api";
import { mapApiJobToRunSummary } from "@/lib/runtime/adapters/map-job";
import { projectRunsPollIntervalMs } from "@/lib/runtime/polling/mission-polling-policy";
import { missionQueryStableOptions } from "@/lib/runtime/polling/mission-query-stable";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { useRuntimeSseStore } from "@/stores/runtime-sse-store";
import {
  mergeRunsWithCache,
  readCachedProjectRuns,
} from "@/lib/runtime/shell/mission-sidebar-cache";
import type { RunSummaryDto } from "@/lib/api/runtime-types";

export type RunsQueryResult = {
  summaries: RunSummaryDto[];
  source: "runtime" | "offline" | "error";
};

/** Opções compartilhadas entre `useRuns` e `useQueries` (vários projetos expandidos). */
export function projectRunsQueryOptions(
  projectId: string | null,
  includeArchived: boolean,
  reachable: boolean,
) {
  return {
    queryKey: runtimeQueryKeys.projectRuns(projectId, includeArchived),
    queryFn: async (): Promise<RunsQueryResult> => {
      if (!projectId) {
        return { summaries: [], source: "offline" };
      }
      if (!reachable) {
        return { summaries: [], source: "offline" };
      }
      const jobs = await fetchRuntimeProjectRecentJobs(projectId, {
        includeArchived,
      });
      return mergeRunsWithCache(projectId, includeArchived, {
        summaries: jobs.map(mapApiJobToRunSummary),
        source: "runtime",
      });
    },
    placeholderData: () =>
      projectId
        ? readCachedProjectRuns(projectId, includeArchived)
        : undefined,
    staleTime: 14_000,
    refetchInterval: () => {
      const s = useRuntimeConnectionStore.getState();
      const sseConnected =
        useRuntimeSseStore.getState().phase === "connected";
      return projectRunsPollIntervalMs({
        reachable: s.connection.reachable,
        sseConnected,
      });
    },
    ...missionQueryStableOptions,
  };
}

export function useRuns(
  projectId: string | null,
  opts?: { includeArchived?: boolean },
) {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const includeArchived = opts?.includeArchived === true;

  return useQuery({
    ...projectRunsQueryOptions(projectId, includeArchived, reachable),
    enabled: Boolean(projectId) && reachable,
    retry: 1,
  });
}
