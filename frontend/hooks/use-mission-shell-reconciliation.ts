"use client";

import { useLayoutEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProjects } from "@/hooks/use-projects";
import { useRuns } from "@/hooks/use-runs";
import { isProjectInRegistry } from "@/lib/runtime/intake/project-registry-validation";
import {
  reconcileMissionShellSelection,
  shellReconcileSignature,
} from "@/lib/runtime/shell/mission-shell-reconciliation";
import { runSelectionKey } from "@/lib/runtime/run-selection";
import { clearCachedProjectRuns } from "@/lib/runtime/shell/mission-sidebar-cache";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

/**
 * Reconcilia selectedProjectId / selectedRunId com GET /projects e runs do projeto.
 * Deve montar após PersistHydrationGate e QueryClientProvider.
 */
export function useMissionShellReconciliation() {
  const qc = useQueryClient();
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const selectedProjectId = useMissionShellStore((s) => s.selectedProjectId);
  const selectedRunId = useMissionShellStore((s) => s.selectedRunId);
  const expandedProjectIds = useMissionShellStore((s) => s.expandedProjectIds);
  const applyShellReconciliation = useMissionShellStore(
    (s) => s.applyShellReconciliation,
  );

  const pq = useProjects();
  const projects = pq.data?.projects ?? [];
  const projectsReady =
    reachable && pq.data?.source === "runtime" && !pq.isPending;

  const projectRegistered =
    Boolean(selectedProjectId) &&
    projectsReady &&
    isProjectInRegistry(selectedProjectId, projects);

  const rq = useRuns(projectRegistered ? selectedProjectId : null);
  const runs = rq.data?.summaries ?? [];
  const runsReady =
    projectRegistered &&
    reachable &&
    rq.isFetched &&
    rq.data?.source === "runtime" &&
    !rq.isFetching;

  const lastSigRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!projectsReady) return;

    const sig = shellReconcileSignature({
      projectsReady,
      runsReady,
      projectIds: projects.map((p) => p.id),
      runKeys: runs.map((r) => runSelectionKey(r)),
      selectedProjectId,
      selectedRunId,
      expandedProjectIds,
    });

    if (lastSigRef.current === sig) return;
    lastSigRef.current = sig;

    const result = reconcileMissionShellSelection({
      selectedProjectId,
      selectedRunId,
      expandedProjectIds,
      projects,
      runs,
      projectsReady,
      runsReady,
    });

    if (!result.changed && !result.notice) return;

    const prevProjectId = selectedProjectId;
    applyShellReconciliation(result);

    if (
      result.notice === "project_unavailable" &&
      prevProjectId &&
      prevProjectId !== result.selectedProjectId
    ) {
      clearCachedProjectRuns(prevProjectId, false);
      clearCachedProjectRuns(prevProjectId, true);
      void qc.removeQueries({
        queryKey: runtimeQueryKeys.projectGovernance(prevProjectId),
      });
      void qc.removeQueries({
        queryKey: runtimeQueryKeys.projectRuns(prevProjectId),
      });
    }

    if (result.notice === "run_unavailable" && selectedProjectId) {
      clearCachedProjectRuns(selectedProjectId, false);
      clearCachedProjectRuns(selectedProjectId, true);
      void qc.invalidateQueries({
        queryKey: runtimeQueryKeys.projectRuns(selectedProjectId),
      });
    }
  }, [
    applyShellReconciliation,
    expandedProjectIds,
    projects,
    projectsReady,
    qc,
    reachable,
    runs,
    runsReady,
    selectedProjectId,
    selectedRunId,
  ]);
}
