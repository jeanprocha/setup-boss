"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { postPrepareGitBranch } from "@/lib/runtime/git/git-branch-actions";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

export function useGitBranchMutation(opts: {
  runKey: string | null;
  projectId: string | null;
}) {
  const qc = useQueryClient();
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const invalidateRunData = async () => {
    await qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
    if (opts.runKey) {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: runtimeQueryKeys.clarification(opts.runKey),
        }),
        qc.invalidateQueries({
          queryKey: runtimeQueryKeys.strategy(opts.runKey),
        }),
        qc.invalidateQueries({
          queryKey: runtimeQueryKeys.execution(opts.runKey),
        }),
      ]);
    }
    if (opts.projectId) {
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.projectRuns(opts.projectId),
      });
      await qc.refetchQueries({
        queryKey: runtimeQueryKeys.projectRuns(opts.projectId),
      });
    }
  };

  const prepareBranch = useMutation({
    mutationFn: async (activityBranch?: string | null) => {
      if (!opts.runKey) throw new Error("runKey em falta");
      if (!reachable) throw new Error("Runtime offline.");
      return postPrepareGitBranch(opts.runKey, activityBranch);
    },
    onSuccess: async () => {
      await invalidateRunData();
    },
  });

  return { prepareBranch };
}
