"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProjects, type ProjectsQueryResult } from "@/hooks/use-projects";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import {
  isProjectInRegistry,
  pickDefaultProjectId,
} from "@/lib/runtime/intake/project-registry-validation";

export function useProjectRegistry() {
  const pq = useProjects();
  const queryClient = useQueryClient();
  const selectedProjectId = useMissionShellStore((s) => s.selectedProjectId);
  const setSelectedProject = useMissionShellStore((s) => s.setSelectedProject);
  const setSelectedRun = useMissionShellStore((s) => s.setSelectedRun);
  const newActivityFlow = useMissionShellStore((s) => s.newActivityFlow);

  const projects = pq.data?.projects ?? [];
  const projectsListReady = pq.isFetched && !pq.isPending;
  const projectsLoading = pq.isPending && pq.fetchStatus === "fetching";

  const projectValid = useMemo(
    () =>
      Boolean(selectedProjectId) &&
      projectsListReady &&
      isProjectInRegistry(selectedProjectId, projects),
    [projectsListReady, selectedProjectId, projects],
  );

  const staleProjectId =
    projectsListReady &&
    Boolean(selectedProjectId) &&
    !isProjectInRegistry(selectedProjectId, projects)
      ? selectedProjectId
      : null;

  const refreshProjects = () => {
    void pq.refetch();
    void queryClient.invalidateQueries({ queryKey: runtimeQueryKeys.projects() });
  };

  const clearInvalidProjectSelection = (opts?: { autoPickFirst?: boolean }) => {
    const cached = queryClient.getQueriesData<ProjectsQueryResult>({
      queryKey: runtimeQueryKeys.projects(),
    });
    const list =
      cached.find(([, d]) => d?.projects?.length)?.[1]?.projects ?? projects;
    const next =
      opts?.autoPickFirst && list.length > 0
        ? pickDefaultProjectId(list)
        : null;
    setSelectedProject(next);
    setSelectedRun(null);
  };

  return {
    projects,
    projectsListReady,
    projectsLoading,
    projectsSource: pq.data?.source ?? "offline",
    selectedProjectId,
    projectValid,
    staleProjectId,
    newActivityFlow,
    refreshProjects,
    clearInvalidProjectSelection,
    setSelectedProject,
  };
}
