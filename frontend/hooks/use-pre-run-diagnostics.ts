"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchPreRunDiagnosticEvents } from "@/lib/api/runtime-api";
import { preRunDiagnosticsPollPolicy } from "@/lib/runtime/polling/mission-polling-policy";
import { missionQueryStableOptions } from "@/lib/runtime/polling/mission-query-stable";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

export function usePreRunDiagnostics(
  projectId: string | null,
  opts?: { hasActiveRun?: boolean },
) {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const hasActiveRun = opts?.hasActiveRun === true;
  const poll = preRunDiagnosticsPollPolicy({
    reachable,
    hasProject: Boolean(projectId),
    hasActiveRun,
  });

  return useQuery({
    queryKey: [
      ...runtimeQueryKeys.preRunDiagnostics(),
      projectId,
      reachable,
      hasActiveRun,
    ],
    queryFn: () =>
      fetchPreRunDiagnosticEvents({
        projectId,
        limit: 40,
      }),
    enabled: poll.enabled,
    staleTime: 12_000,
    refetchInterval: poll.intervalMs,
    ...missionQueryStableOptions,
  });
}
