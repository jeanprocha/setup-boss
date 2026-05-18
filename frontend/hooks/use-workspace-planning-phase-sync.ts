"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { useWorkspaceRunDetail } from "@/hooks/use-workspace-run-detail";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { isWorkspaceRunOperationalPhase } from "@/lib/workspace/workspace-run-lifecycle";

/**
 * Quando mini-atividades são materializadas, actualiza o read model do workspace
 * sem trocar de shell (mantém a timeline da corrida de planeamento).
 */
export function useWorkspacePlanningPhaseSync() {
  const qc = useQueryClient();
  const workspaceRunId = useMissionShellStore((s) => s.selectedWorkspaceRunId);
  const { runQuery } = useWorkspaceRunDetail(workspaceRunId);

  useEffect(() => {
    if (!workspaceRunId || !runQuery.data) return;
    if (!isWorkspaceRunOperationalPhase(runQuery.data)) return;

    void qc.invalidateQueries({
      queryKey: runtimeQueryKeys.workspaceRunDetail(workspaceRunId),
    });
    void qc.invalidateQueries({
      queryKey: runtimeQueryKeys.workspaceRunGit(workspaceRunId),
    });
  }, [workspaceRunId, runQuery.data, qc]);
}
