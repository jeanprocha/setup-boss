"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchOperationalFinalizationSession } from "@/lib/runtime/operational/operational-finalization-actions";
import type { ExecutionLifecyclePhase } from "@/lib/runtime/execution/execution-types";
import type { OperationalReviewHitlDto } from "@/lib/runtime/operational/operational-review-types";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

export function useOperationalFinalization(
  runKey: string | null,
  reviewHitl: OperationalReviewHitlDto | null | undefined,
) {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const enabled =
    Boolean(runKey) &&
    reachable &&
    reviewHitl?.status === "confirmed";

  const q = useQuery({
    queryKey: runtimeQueryKeys.operationalFinalization(runKey),
    queryFn: () => fetchOperationalFinalizationSession(runKey!),
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
