"use client";



import { useQuery } from "@tanstack/react-query";

import { runtimeQueryKeys } from "@/lib/api/query-keys";

import { fetchExecutionBundle } from "@/lib/runtime/execution/execution-actions";

import {

  deriveExecutionAvailability,

  deriveLifecycleFromRunMeta,

  executionAppliesToRun,

} from "@/lib/runtime/execution/execution-state";

import {

  mergeProgress,

  selectActiveSubtask,

  selectOrderedSubtasks,

  buildExecutionCorrelationLinks,

} from "@/lib/runtime/execution/execution-selectors";

import { reconcileLifecyclePhase } from "@/lib/runtime/execution/execution-adapters";

import {

  executionPollIntervalMs,

  isValidRunSelectionKey,

} from "@/lib/runtime/polling/mission-polling-policy";

import { missionQueryStableOptions } from "@/lib/runtime/polling/mission-query-stable";

import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

import { useRuntimeSseStore } from "@/stores/runtime-sse-store";

import { useOrchestrationStore } from "@/stores/orchestration-store";

import { isOrchestrationActive } from "@/lib/runtime/orchestration/orchestration-state";
import {
  isRunReadModelConflictError,
  isRunReadModelConflictReason,
} from "@/lib/runtime/run-read-model-http";



export function useExecution(

  runKey: string | null,

  phaseRaw: string | null | undefined,

  stateRaw: string | null | undefined,

  opts?: { hasEvidence?: boolean; hasDiagnostics?: boolean },

) {

  const connection = useRuntimeConnectionStore((s) => s.connection);

  const lastBootstrap = useOrchestrationStore((s) => s.lastBootstrap);

  const orchState =

    lastBootstrap && lastBootstrap.runId === runKey

      ? lastBootstrap.orchestrationState

      : null;



  const runKeyValid = isValidRunSelectionKey(runKey);

  const applies = executionAppliesToRun(phaseRaw, stateRaw);

  const orchestrationActive = isOrchestrationActive(

    orchState as Parameters<typeof isOrchestrationActive>[0],

  );



  const q = useQuery({

    queryKey: runtimeQueryKeys.execution(runKey),

    queryFn: () => fetchExecutionBundle(runKey!),

    enabled: runKeyValid && applies && connection.reachable,

    staleTime: 6_000,

    retry: (failureCount, error) =>
      !isRunReadModelConflictError(error) && failureCount < 2,

    refetchInterval: (query) => {
      if (
        isRunReadModelConflictReason(
          query.state.data?.summary.unsupportedReason,
        )
      ) {
        return false;
      }
      if (isRunReadModelConflictError(query.state.error)) {
        return false;
      }

      const sseConnected =
        useRuntimeSseStore.getState().phase === "connected";

      return executionPollIntervalMs({
        reachable: connection.reachable,
        runKeyValid,
        orchestrationActive,
        sseConnected,
      });
    },

    ...missionQueryStableOptions,

  });



  const raw = q.data ?? null;

  const inferred = deriveLifecycleFromRunMeta(phaseRaw, stateRaw, raw);

  const bundle = raw ? reconcileLifecyclePhase(raw, inferred) : null;



  const subtasks = bundle ? selectOrderedSubtasks(bundle.subtasks) : [];

  const progress = bundle

    ? mergeProgress(bundle.summary.progress, subtasks)

    : null;

  const activeSubtask = bundle ? selectActiveSubtask(bundle) : null;



  const availability = deriveExecutionAvailability(bundle, {

    connectionDegraded: connection.degraded,

    runtimeReachable: connection.reachable,

  });



  const correlation = buildExecutionCorrelationLinks(

    bundle,

    opts?.hasEvidence ?? false,

    opts?.hasDiagnostics ?? connection.reachable,

  );



  return {

    bundle: bundle

      ? {

          ...bundle,

          subtasks,

          summary: { ...bundle.summary, progress: progress ?? bundle.summary.progress },

        }

      : null,

    applies,

    availability,

    activeSubtask,

    correlation,

    isLoading: q.isLoading,

    isError: q.isError,

    error: q.error,

    refetch: q.refetch,

    source: bundle?.summary.source ?? null,

    lifecyclePhase: bundle?.summary.lifecycle.phase ?? inferred,

  };

}

