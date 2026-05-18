"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchRuntimeRecoverySnapshot } from "@/lib/runtime/orchestration/orchestration-recovery-actions";
import { restoreOrchestrationForRun } from "@/lib/runtime/orchestration/orchestration-recovery-sync";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { useEffect } from "react";

export function useRuntimeRecovery(
  projectId: string | null,
  selectedRunKey: string | null,
) {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const q = useQuery({
    queryKey: [...runtimeQueryKeys.root, "recovery", projectId],
    queryFn: () => fetchRuntimeRecoverySnapshot(),
    enabled: Boolean(projectId) && reachable,
    staleTime: 8_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!selectedRunKey || !q.data) return;
    restoreOrchestrationForRun(selectedRunKey, q.data);
  }, [selectedRunKey, q.data]);

  const row =
    selectedRunKey && q.data
      ? q.data.activeRuns.find((r) => r.runId === selectedRunKey)
      : null;

  return {
    snapshot: q.data ?? null,
    activeRun: row ?? null,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}
