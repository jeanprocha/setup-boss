import type { QueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import type { RunsQueryResult } from "@/hooks/use-runs";
import {
  runMatchesSelectionKey,
  runSelectionKey,
} from "@/lib/runtime/run-selection";

/** Alinha a chave persistida com o formato da lista GET project runs. */
export function resolveCanonicalRunKey(
  qc: QueryClient,
  projectId: string,
  runKey: string,
): string {
  const key = runKey.trim();
  if (!key) return key;

  const rows = qc.getQueriesData<RunsQueryResult>({
    predicate: (q) => {
      const k = q.queryKey;
      return (
        Array.isArray(k) &&
        k[0] === "runtime" &&
        k[1] === "projectRuns" &&
        k[2] === projectId
      );
    },
  });

  for (const [, data] of rows) {
    const hit = data?.summaries?.find((s) => runMatchesSelectionKey(s, key));
    if (hit) return runSelectionKey(hit);
  }

  return key;
}
