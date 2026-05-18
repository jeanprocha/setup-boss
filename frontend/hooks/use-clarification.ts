"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchClarificationBundle } from "@/lib/runtime/clarification/clarification-actions";
import {
  clarificationAppliesToRun,
  deriveClarificationAvailability,
} from "@/lib/runtime/clarification/clarification-state";
import { missionQueryStableOptions } from "@/lib/runtime/polling/mission-query-stable";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import {
  isRunReadModelConflictError,
  isRunReadModelNotFoundError,
} from "@/lib/runtime/run-read-model-http";

export function useClarification(
  runKey: string | null,
  phaseRaw: string | null | undefined,
  stateRaw: string | null | undefined,
) {
  const connection = useRuntimeConnectionStore((s) => s.connection);

  const applies = clarificationAppliesToRun(phaseRaw, stateRaw);

  const q = useQuery({
    queryKey: runtimeQueryKeys.clarification(runKey),
    queryFn: () => fetchClarificationBundle(runKey!),
    enabled: Boolean(runKey) && applies && connection.reachable,
    staleTime: 8_000,
    retry: (failureCount, error) =>
      !isRunReadModelConflictError(error) &&
      !isRunReadModelNotFoundError(error) &&
      failureCount < 2,
    ...missionQueryStableOptions,
  });

  const availability = deriveClarificationAvailability(q.data ?? null, {
    runtimeReachable: connection.reachable,
    connectionDegraded: connection.degraded,
  });

  return {
    bundle: q.data ?? null,
    applies,
    availability,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isPending: q.isPending,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
    source: q.data?.source ?? null,
  };
}
