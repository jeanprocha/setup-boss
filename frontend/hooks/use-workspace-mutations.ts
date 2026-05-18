"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import {
  deleteWorkspace,
  formatWorkspaceValidationMessage,
  patchWorkspace,
  postWorkspace,
  type WorkspaceWritePayload,
} from "@/lib/api/workspace-runtime-api";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

function invalidateWorkspaces(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: runtimeQueryKeys.workspaces() });
}

export function useWorkspaceMutations() {
  const qc = useQueryClient();
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const guard = () => {
    if (!reachable) throw new Error("Runtime offline.");
  };

  const create = useMutation({
    mutationFn: async (input: { name: string; projectIds: string[] }) => {
      guard();
      return postWorkspace(input);
    },
    onSuccess: async (ws) => {
      await invalidateWorkspaces(qc);
      const store = useMissionShellStore.getState();
      store.setSelectedWorkspace(ws.workspaceId);
      if (!store.expandedWorkspaceIds.includes(ws.workspaceId)) {
        useMissionShellStore.setState({
          expandedWorkspaceIds: [...store.expandedWorkspaceIds, ws.workspaceId],
        });
      }
    },
  });

  const update = useMutation({
    mutationFn: async ({
      workspaceId,
      patch,
    }: {
      workspaceId: string;
      patch: WorkspaceWritePayload;
    }) => {
      guard();
      return patchWorkspace(workspaceId, patch);
    },
    onSuccess: () => invalidateWorkspaces(qc),
  });

  const remove = useMutation({
    mutationFn: async (workspaceId: string) => {
      guard();
      await deleteWorkspace(workspaceId);
      return workspaceId;
    },
    onSuccess: (workspaceId) => {
      const store = useMissionShellStore.getState();
      if (store.selectedWorkspaceId === workspaceId) {
        store.setSelectedWorkspace(null);
      }
      useMissionShellStore.setState({
        expandedWorkspaceIds: store.expandedWorkspaceIds.filter(
          (id) => id !== workspaceId,
        ),
      });
      void invalidateWorkspaces(qc);
    },
  });

  const mutationErrorMessage = (err: unknown, fallback: string) =>
    formatWorkspaceValidationMessage(err, fallback);

  return { create, update, remove, mutationErrorMessage };
}
