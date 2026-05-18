"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchWorkspaceRunSyncStatus } from "@/lib/api/workspace-runtime-api";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

function isSyncRecentlyActive(
  status: {
    enabled: boolean;
    lastTickAt?: string | null;
    intervalMs?: number;
    effectiveIntervalMs?: number;
  } | null,
) {
  if (!status?.enabled || !status.lastTickAt) return false;
  const tickMs = Date.parse(status.lastTickAt);
  if (!Number.isFinite(tickMs)) return false;
  const interval = status.effectiveIntervalMs ?? status.intervalMs ?? 5000;
  return Date.now() - tickMs <= interval * 2.5;
}

export function useWorkspaceRunSyncStatus() {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const query = useQuery({
    queryKey: ["workspace-run-sync-status", { reachable }],
    queryFn: async () => {
      if (!reachable) return null;
      return fetchWorkspaceRunSyncStatus();
    },
    enabled: reachable,
    staleTime: 4_000,
    refetchInterval: reachable ? 8_000 : false,
  });

  const active = isSyncRecentlyActive(query.data ?? null);

  return { query, active, enabled: query.data?.enabled !== false };
}
