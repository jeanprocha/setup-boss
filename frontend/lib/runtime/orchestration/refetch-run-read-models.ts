import type { QueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";

/** Refetch read models de um run (reopen / recovery / re-clique na lista). */
export function refetchRunReadModels(
  qc: QueryClient,
  runKey: string,
): Promise<unknown[]> {
  return Promise.all([
    qc.refetchQueries({ queryKey: runtimeQueryKeys.strategy(runKey) }),
    qc.refetchQueries({ queryKey: runtimeQueryKeys.clarification(runKey) }),
    qc.refetchQueries({ queryKey: runtimeQueryKeys.execution(runKey) }),
    qc.refetchQueries({
      queryKey: runtimeQueryKeys.runObservabilityBundle(runKey),
    }),
  ]);
}
