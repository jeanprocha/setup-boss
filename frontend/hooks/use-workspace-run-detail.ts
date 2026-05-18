"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import {
  fetchWorkspaceRun,
  fetchWorkspaceRunGitStatus,
} from "@/lib/api/workspace-runtime-api";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { parseWorkspaceGlobalSpec } from "@/lib/workspace/workspace-global-spec";
import { isWorkspaceRunOperationalPhase } from "@/lib/workspace/workspace-run-lifecycle";

export function useWorkspaceRunDetail(workspaceRunId: string | null) {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const runQuery = useQuery({
    queryKey: [...runtimeQueryKeys.workspaceRunDetail(workspaceRunId), { reachable }],
    queryFn: async () => {
      if (!workspaceRunId || !reachable) return null;
      return fetchWorkspaceRun(workspaceRunId);
    },
    enabled: Boolean(workspaceRunId && reachable),
    staleTime: 8_000,
    refetchInterval: (query) => {
      const run = query.state.data;
      if (!run || isWorkspaceRunOperationalPhase(run)) return false;
      const spec = parseWorkspaceGlobalSpec(run.globalSpec);
      if (!spec?.planningRunId?.trim()) return false;
      return 4_000;
    },
  });

  const gitQuery = useQuery({
    queryKey: [...runtimeQueryKeys.workspaceRunGit(workspaceRunId), { reachable }],
    queryFn: async () => {
      if (!workspaceRunId || !reachable) return null;
      return fetchWorkspaceRunGitStatus(workspaceRunId);
    },
    enabled: Boolean(workspaceRunId && reachable),
    staleTime: 5_000,
  });

  return { runQuery, gitQuery };
}
