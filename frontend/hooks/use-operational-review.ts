"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchOperationalReviewSession } from "@/lib/runtime/operational/operational-review-actions";
import type { ExecutionLifecyclePhase } from "@/lib/runtime/execution/execution-types";
import { isExecutionOperationallyComplete } from "@/lib/runtime/operational/review-operational-state";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import type { RunSummaryDto } from "@/lib/api/runtime-types";

export function useOperationalReview(
  runKey: string | null,
  summary: RunSummaryDto | null | undefined,
  executionLifecyclePhase: ExecutionLifecyclePhase | null,
) {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const enabled =
    Boolean(runKey) &&
    reachable &&
    isExecutionOperationallyComplete(executionLifecyclePhase, summary ?? null);

  const q = useQuery({
    queryKey: runtimeQueryKeys.operationalReview(runKey),
    queryFn: () => fetchOperationalReviewSession(runKey!),
    enabled,
    staleTime: 8_000,
    refetchInterval: enabled ? 12_000 : false,
  });

  return {
    session: q.data ?? null,
    hitl: q.data?.hitl ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}
