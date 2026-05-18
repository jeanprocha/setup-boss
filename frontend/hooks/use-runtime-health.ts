"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import {
  fetchRuntimeHealth,
  fetchRuntimeStatusQueueHealth,
} from "@/lib/api/runtime-api";
import type { RuntimeHealthDto } from "@/lib/api/runtime-types";
import { isRuntimeApiError } from "@/lib/api/runtime-errors";
import { healthPollIntervalMs } from "@/lib/runtime/polling/mission-polling-policy";
import { missionQueryStableOptions } from "@/lib/runtime/polling/mission-query-stable";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

export type RuntimeHealthQueryData = {
  health: RuntimeHealthDto;
  queueHealth: "ok" | "degraded" | "unknown";
};

export function useRuntimeHealth() {
  const ingest = useRuntimeConnectionStore((s) => s.ingestProbeResult);

  const q = useQuery({
    queryKey: runtimeQueryKeys.health(),
    queryFn: async (): Promise<RuntimeHealthQueryData> => {
      const health = await fetchRuntimeHealth();
      const queueHealth = health.ok
        ? await fetchRuntimeStatusQueueHealth()
        : "unknown";
      return { health, queueHealth };
    },
    staleTime: 6_000,
    refetchInterval: (query) => healthPollIntervalMs(query.state.status),
    retry: 1,
    retryDelay: 2_500,
    refetchOnWindowFocus: false,
    ...missionQueryStableOptions,
  });

  useEffect(() => {
    if (q.isPending) return;
    if (q.isError) {
      const msg = isRuntimeApiError(q.error)
        ? q.error.message
        : q.error instanceof Error
          ? q.error.message
          : "runtime_unreachable";
      ingest({
        health: null,
        healthFetchFailed: true,
        healthErrorMessage: msg,
        queueHealth: "unknown",
      });
      return;
    }
    if (q.isSuccess && q.data) {
      ingest({
        health: q.data.health,
        healthFetchFailed: !q.data.health.ok,
        healthErrorMessage: q.data.health.ok ? null : "health_not_ok",
        queueHealth: q.data.queueHealth,
      });
    }
  }, [q.isPending, q.isError, q.isSuccess, q.data, q.error, ingest]);

  return q;
}
