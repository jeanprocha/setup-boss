"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { postExecuteRun } from "@/lib/runtime/orchestration/orchestration-actions";
import type { ExecuteAvailability } from "@/lib/runtime/orchestration/orchestration-types";
import { shouldOpenExecutionTab } from "@/lib/runtime/orchestration/orchestration-state";
import { useOrchestrationStore } from "@/stores/orchestration-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

export function useOrchestrationMutations(opts: {
  runKey: string | null;
  projectId: string | null;
  availability: ExecuteAvailability;
}) {
  const qc = useQueryClient();
  const requestExecutionBootstrap = useOrchestrationStore(
    (s) => s.requestExecutionBootstrap,
  );
  const setLastBootstrap = useOrchestrationStore((s) => s.setLastBootstrap);
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
    if (opts.runKey) {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: runtimeQueryKeys.execution(opts.runKey),
        }),
        qc.invalidateQueries({
          queryKey: runtimeQueryKeys.clarification(opts.runKey),
        }),
        qc.invalidateQueries({
          queryKey: runtimeQueryKeys.strategy(opts.runKey),
        }),
        qc.invalidateQueries({
          queryKey: runtimeQueryKeys.runEvidence(opts.runKey),
        }),
        qc.refetchQueries({
          queryKey: runtimeQueryKeys.execution(opts.runKey),
        }),
      ]);
    }
    if (opts.projectId) {
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.projectRuns(opts.projectId),
      });
    }
  };

  const executeRun = useMutation({
    mutationFn: async () => {
      if (!opts.runKey) throw new Error("runKey em falta");
      if (!reachable) throw new Error("Runtime offline.");
      if (!opts.availability.canExecute) {
        throw new Error(opts.availability.message || "Execute bloqueado.");
      }
      const r = await postExecuteRun(opts.runKey);
      if (!r.ok || !r.data) throw new Error(r.message);
      return r;
    },
    onSuccess: async (result) => {
      if (result.data) {
        setLastBootstrap(result.data);
        if (opts.runKey && shouldOpenExecutionTab(result.data.executionState)) {
          requestExecutionBootstrap(opts.runKey, result.data);
        }
      }
      await invalidate();
    },
  });

  return { executeRun };
}
