"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRuntimeHeartbeat } from "@/lib/api/runtime-api";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import type { RuntimeHeartbeatDto } from "@/lib/api/runtime-types";
import { healthPollIntervalMs } from "@/lib/runtime/polling/mission-polling-policy";
import { missionQueryStableOptions } from "@/lib/runtime/polling/mission-query-stable";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

export function useRuntimeHeartbeat(opts?: { enabled?: boolean }) {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const enabled = (opts?.enabled ?? true) && reachable;

  return useQuery({
    queryKey: runtimeQueryKeys.heartbeat(),
    queryFn: fetchRuntimeHeartbeat,
    enabled,
    staleTime: 5_000,
    refetchInterval: (query) => healthPollIntervalMs(query.state.status),
    retry: 1,
    retryDelay: 2_500,
    refetchOnWindowFocus: false,
    ...missionQueryStableOptions,
  });
}

export type RuntimeHeartbeatQuery = {
  heartbeat: RuntimeHeartbeatDto | null;
  isLoading: boolean;
  isError: boolean;
};

export function useRuntimeHeartbeatSnapshot(): RuntimeHeartbeatQuery {
  const q = useRuntimeHeartbeat();
  return {
    heartbeat: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
