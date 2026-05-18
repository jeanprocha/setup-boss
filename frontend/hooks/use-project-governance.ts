"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchProjectGovernance } from "@/lib/api/runtime-api";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { useProjects } from "@/hooks/use-projects";
import { canFetchProjectGovernance } from "@/lib/runtime/intake/project-registry-validation";
import { governanceQueryEnabled } from "@/lib/runtime/polling/mission-polling-policy";
import { missionQueryStableOptions } from "@/lib/runtime/polling/mission-query-stable";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

export function useProjectGovernance(projectId: string | null) {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const queryClient = useQueryClient();
  const projectsQ = useProjects();
  const projects = projectsQ.data?.projects ?? [];
  const projectsReady =
    projectsQ.data?.source === "runtime" && !projectsQ.isPending;
  const governanceEnabled = governanceQueryEnabled({
    governanceEnabled: canFetchProjectGovernance(projectId, projects, {
      reachable,
      projectsReady,
    }),
  });

  const query = useQuery({
    queryKey: runtimeQueryKeys.projectGovernance(projectId),
    queryFn: () => fetchProjectGovernance(projectId!),
    enabled: governanceEnabled,
    staleTime: 30_000,
    refetchInterval: false,
    ...missionQueryStableOptions,
  });

  const retryValidation = () => {
    if (!projectId) return;
    void queryClient.invalidateQueries({
      queryKey: runtimeQueryKeys.projectGovernance(projectId),
    });
    void query.refetch();
  };

  return { ...query, retryValidation };
}
