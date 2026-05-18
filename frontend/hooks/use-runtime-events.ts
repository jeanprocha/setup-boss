"use client";



import { useQuery } from "@tanstack/react-query";

import { runtimeQueryKeys } from "@/lib/api/query-keys";

import { fetchRuntimeEvents } from "@/lib/api/runtime-api";

import { mapApiEventToDto } from "@/lib/runtime/adapters/map-event";

import type { RuntimeEventDto } from "@/lib/api/runtime-types";

import { runtimeEventsPollIntervalMs } from "@/lib/runtime/polling/mission-polling-policy";

import { missionQueryStableOptions } from "@/lib/runtime/polling/mission-query-stable";

import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

import { useRuntimeSseStore } from "@/stores/runtime-sse-store";

import { useRuntimeLiveEventsStore } from "@/stores/runtime-live-events-store";

import { useEffect } from "react";



const LIMIT = 150;



export type RuntimeEventsResult = {

  events: RuntimeEventDto[];

  source: "runtime" | "offline";

};



export function useRuntimeEvents(
  projectId: string | null,
  runKey?: string | null,
) {

  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const ssePhase = useRuntimeSseStore((s) => s.phase);

  const runKeyTrimmed = runKey?.trim() || null;



  const q = useQuery({

    queryKey: [
      ...runtimeQueryKeys.events(projectId, LIMIT, runKeyTrimmed),
      { reachable },
    ],

    queryFn: async (): Promise<RuntimeEventsResult> => {

      if (!reachable || !projectId) {

        return { events: [], source: "offline" };

      }

      try {

        const rows = await fetchRuntimeEvents({
          projectId,
          limit: LIMIT,
          runKey: runKeyTrimmed,
        });

        return {

          events: rows.map(mapApiEventToDto),

          source: "runtime",

        };

      } catch {

        return { events: [], source: "offline" };

      }

    },

    enabled: Boolean(projectId) && reachable,

    staleTime: 8_000,

    refetchInterval: () =>

      runtimeEventsPollIntervalMs({ reachable, ssePhase }),

    ...missionQueryStableOptions,

  });

  useEffect(() => {
    if (q.data?.source !== "runtime" || !q.data.events.length) return;
    const upsert = useRuntimeLiveEventsStore.getState().upsert;
    for (const ev of q.data.events) upsert(ev);
  }, [q.data?.events, q.data?.source]);

  return q;

}

