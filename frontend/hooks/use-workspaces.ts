"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchWorkspaces } from "@/lib/api/workspace-runtime-api";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import type { SetupWorkspaceDto } from "@/lib/api/workspace-types";

export function useWorkspaces() {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  return useQuery({
    queryKey: [...runtimeQueryKeys.workspaces(), { reachable }],
    queryFn: async (): Promise<{
      workspaces: SetupWorkspaceDto[];
      source: "runtime" | "offline" | "error";
      errorMessage?: string;
    }> => {
      if (!reachable) return { workspaces: [], source: "offline" };
      try {
        const workspaces = await fetchWorkspaces();
        return { workspaces, source: "runtime" };
      } catch (e) {
        return {
          workspaces: [],
          source: "error",
          errorMessage: e instanceof Error ? e.message : String(e),
        };
      }
    },
    staleTime: 20_000,
    refetchInterval: reachable ? 30_000 : false,
  });
}
