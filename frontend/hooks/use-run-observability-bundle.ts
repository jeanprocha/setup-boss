"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRunObservabilityBundle } from "@/lib/api/runtime-api";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import {
  isValidRunSelectionKey,
  runObservabilityPollIntervalMs,
} from "@/lib/runtime/polling/mission-polling-policy";
import { missionQueryStableOptions } from "@/lib/runtime/polling/mission-query-stable";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { useRuntimeSseStore } from "@/stores/runtime-sse-store";

export function useRunObservabilityBundle(runKey: string | null) {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const ssePhase = useRuntimeSseStore((s) => s.phase);
  const runKeyValid = isValidRunSelectionKey(runKey);
  const sseConnected = ssePhase === "connected";

  return useQuery({
    queryKey: [...runtimeQueryKeys.runObservabilityBundle(runKey), { reachable }],
    queryFn: async () => fetchRunObservabilityBundle(runKey!),
    enabled: runKeyValid && reachable,
    staleTime: 8_000,
    refetchInterval: () =>
      runObservabilityPollIntervalMs({
        reachable,
        runKeyValid,
        sseConnected,
      }),
    ...missionQueryStableOptions,
  });
}
