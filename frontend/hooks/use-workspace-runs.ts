"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchWorkspaceRuns } from "@/lib/api/workspace-runtime-api";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

export function useWorkspaceRuns(workspaceId: string | null) {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  return useQuery({
    queryKey: [...runtimeQueryKeys.workspaceRuns(workspaceId), { reachable }],
    queryFn: async () => {
      if (!reachable || !workspaceId) return [];
      return fetchWorkspaceRuns(workspaceId);
    },
    enabled: Boolean(reachable && workspaceId),
    staleTime: 15_000,
  });
}
