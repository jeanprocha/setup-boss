"use client";

import { useEffect } from "react";
import { useWorkspaceRunDetail } from "@/hooks/use-workspace-run-detail";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

/**
 * Limpa selectedWorkspaceRunId stale sem tocar na seleção de projeto/run.
 */
export function useWorkspaceRunSelectionReconciliation() {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const workspaceRunId = useMissionShellStore((s) => s.selectedWorkspaceRunId);
  const setSelectedWorkspaceRun = useMissionShellStore(
    (s) => s.setSelectedWorkspaceRun,
  );
  const { runQuery } = useWorkspaceRunDetail(workspaceRunId);

  useEffect(() => {
    if (!workspaceRunId) return;
    if (!reachable) return;
    if (runQuery.isPending || runQuery.isLoading) return;
    if (runQuery.isError) {
      setSelectedWorkspaceRun(null);
      return;
    }
    if (runQuery.isSuccess && !runQuery.data) {
      setSelectedWorkspaceRun(null);
    }
  }, [
    reachable,
    workspaceRunId,
    runQuery.isPending,
    runQuery.isLoading,
    runQuery.isError,
    runQuery.isSuccess,
    runQuery.data,
    setSelectedWorkspaceRun,
  ]);
}
