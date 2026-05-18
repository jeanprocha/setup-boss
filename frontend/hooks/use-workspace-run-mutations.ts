"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import {
  postPrepareWorkspaceGit,
  postRetryPrepareWorkspaceGitProject,
  postResumeWorkspaceRun,
  postRetryWorkspaceMiniActivity,
  postSkipWorkspaceMiniActivity,
  postStartWorkspaceRun,
} from "@/lib/api/workspace-runtime-api";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

function workspaceMutationErrorMessage(e: unknown): string {
  if (e instanceof RuntimeApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

export function useWorkspaceRunMutations(workspaceRunId: string | null) {
  const qc = useQueryClient();
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
    if (workspaceRunId) {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: runtimeQueryKeys.workspaceRunDetail(workspaceRunId),
        }),
        qc.invalidateQueries({
          queryKey: runtimeQueryKeys.workspaceRunGit(workspaceRunId),
        }),
      ]);
    }
  };

  const guard = () => {
    if (!workspaceRunId) throw new Error("workspaceRunId em falta");
    if (!reachable) throw new Error("Runtime offline.");
  };

  const prepareGit = useMutation({
    mutationFn: async (opts?: { skipProjectIds?: string[]; force?: boolean }) => {
      guard();
      return postPrepareWorkspaceGit(workspaceRunId!, opts ?? {});
    },
    onSuccess: invalidate,
  });

  const retryPrepareGitProject = useMutation({
    mutationFn: async (projectId: string) => {
      guard();
      return postRetryPrepareWorkspaceGitProject(workspaceRunId!, projectId);
    },
    onSuccess: invalidate,
  });

  const start = useMutation({
    mutationFn: async () => {
      guard();
      return postStartWorkspaceRun(workspaceRunId!);
    },
    onSuccess: invalidate,
  });

  const resume = useMutation({
    mutationFn: async () => {
      guard();
      return postResumeWorkspaceRun(workspaceRunId!);
    },
    onSuccess: invalidate,
  });

  const retryMini = useMutation({
    mutationFn: async (miniActivityId: string) => {
      guard();
      return postRetryWorkspaceMiniActivity(workspaceRunId!, miniActivityId);
    },
    onSuccess: invalidate,
  });

  const skipMini = useMutation({
    mutationFn: async (miniActivityId: string) => {
      guard();
      return postSkipWorkspaceMiniActivity(workspaceRunId!, miniActivityId);
    },
    onSuccess: invalidate,
  });

  return {
    prepareGit,
    retryPrepareGitProject,
    start,
    resume,
    retryMini,
    skipMini,
    workspaceMutationErrorMessage,
    refresh: invalidate,
  };
}
