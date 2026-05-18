"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PersistHydrationGate } from "@/components/features/PersistHydrationGate";
import { MissionShellReconciliation } from "@/components/features/MissionShellReconciliation";
import { useRuntimeHealth } from "@/hooks/use-runtime-health";
import { useRuntimeRecovery } from "@/hooks/use-runtime-recovery";
import { useRuntimeConnectionRecovery } from "@/hooks/use-runtime-connection-recovery";
import { useRuntimeSse } from "@/hooks/use-runtime-sse";
import { useWorkspaceRunSse } from "@/hooks/use-workspace-run-sse";
import { useProjects } from "@/hooks/use-projects";
import { projectRunsQueryOptions } from "@/hooks/use-runs";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { isProjectInRegistry } from "@/lib/runtime/intake/project-registry-validation";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useMissionLocaleStore } from "@/stores/mission-locale-store";

/**
 * Mantém o heartbeat /health + ingestão no store de conexão.
 * Deve montar uma vez dentro do QueryClientProvider.
 */
export function MissionRuntimeRoot({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const projectId = useMissionShellStore((s) => s.selectedProjectId);
  const expandedProjectIds = useMissionShellStore((s) => s.expandedProjectIds);
  const selectedWorkspaceId = useMissionShellStore((s) => s.selectedWorkspaceId);
  const selectedRunId = useMissionShellStore((s) => s.selectedRunId);
  const runKey = selectedRunId;
  const pq = useProjects();
  const registeredProjectId =
    projectId &&
    pq.data?.source === "runtime" &&
    isProjectInRegistry(projectId, pq.data.projects)
      ? projectId
      : null;

  const locale = useMissionLocaleStore((s) => s.locale);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "pt-BR";
  }, [locale]);

  useRuntimeHealth();

  useEffect(() => {
    if (!reachable) return;
    const ids = new Set<string>();
    if (registeredProjectId) ids.add(registeredProjectId);
    for (const pid of expandedProjectIds) ids.add(pid);
    for (const pid of ids) {
      void qc.prefetchQuery(
        projectRunsQueryOptions(pid, false, true),
      );
    }
  }, [reachable, registeredProjectId, expandedProjectIds, qc]);

  useRuntimeConnectionRecovery(registeredProjectId, runKey);
  useRuntimeRecovery(registeredProjectId, runKey);
  useRuntimeSse(registeredProjectId, runKey);
  useWorkspaceRunSse(selectedWorkspaceId);

  return (
    <PersistHydrationGate>
      <MissionShellReconciliation />
      {children}
    </PersistHydrationGate>
  );
}
