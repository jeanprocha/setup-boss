"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { postPublishGitBranch } from "@/lib/runtime/git/git-push-actions";

export function useGitPushMutation(opts: {
  runKey: string | null;
  projectId: string | null;
}) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!opts.runKey) {
        return Promise.reject(new Error("Corrida não seleccionada."));
      }
      return postPublishGitBranch(opts.runKey);
    },
    onSuccess: async () => {
      if (opts.projectId) {
        await qc.invalidateQueries({
          queryKey: runtimeQueryKeys.projectRuns(opts.projectId),
        });
      }
      if (opts.runKey) {
        await qc.invalidateQueries({
          queryKey: runtimeQueryKeys.runObservabilityBundle(opts.runKey),
        });
      }
    },
  });
}
