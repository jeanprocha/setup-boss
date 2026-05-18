"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchStrategyBundle } from "@/lib/runtime/strategy/strategy-actions";
import {
  deriveStrategyAvailability,
  strategyAppliesToRun,
} from "@/lib/runtime/strategy/strategy-state";
import {
  buildStrategyContextHighlights,
  flattenSubtaskTree,
  selectCriticalRisks,
  selectOrderingHighlights,
} from "@/lib/runtime/strategy/strategy-selectors";
import { missionQueryStableOptions } from "@/lib/runtime/polling/mission-query-stable";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { isRunReadModelConflictError } from "@/lib/runtime/run-read-model-http";

export function useStrategy(
  runKey: string | null,
  phaseRaw: string | null | undefined,
  stateRaw: string | null | undefined,
) {
  const connection = useRuntimeConnectionStore((s) => s.connection);

  const applies = strategyAppliesToRun(phaseRaw, stateRaw);

  const q = useQuery({
    queryKey: runtimeQueryKeys.strategy(runKey),
    queryFn: () => fetchStrategyBundle(runKey!),
    enabled: Boolean(runKey) && applies && connection.reachable,
    staleTime: 8_000,
    retry: (failureCount, error) =>
      !isRunReadModelConflictError(error) && failureCount < 2,
    ...missionQueryStableOptions,
  });

  const bundle = q.data ?? null;
  const availability = deriveStrategyAvailability(bundle, {
    runtimeReachable: connection.reachable,
    connectionDegraded: connection.degraded,
  });

  const treeRows = bundle ? flattenSubtaskTree(bundle.subtasks) : [];
  const criticalRisks = bundle ? selectCriticalRisks(bundle) : [];
  const orderingHighlights = bundle
    ? selectOrderingHighlights(bundle.ordering)
    : null;
  const contextHighlights = bundle ? buildStrategyContextHighlights(bundle) : null;

  return {
    bundle,
    applies,
    availability,
    treeRows,
    criticalRisks,
    orderingHighlights,
    contextHighlights,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isPending: q.isPending,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
    source: bundle?.summary.source ?? null,
    runtimePhase: bundle?.summary.runtimePhase ?? "unavailable",
  };
}
