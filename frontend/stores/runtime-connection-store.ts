import { create } from "zustand";
import type {
  RuntimeConnectionState,
  RuntimeHealthDto,
} from "@/lib/api/runtime-types";
import { buildRuntimeConnectionState } from "@/lib/runtime/adapters/map-connection";

type RuntimeConnectionStore = {
  connection: RuntimeConnectionState;
  lastHealth: RuntimeHealthDto | null;
  lastHealthFetchFailed: boolean;
  queueHealth: "ok" | "degraded" | "unknown";
  lastErrorMessage: string | null;
  ingestProbeResult: (input: {
    health: RuntimeHealthDto | null;
    healthFetchFailed: boolean;
    healthErrorMessage: string | null;
    queueHealth: "ok" | "degraded" | "unknown";
  }) => void;
};

function compute(
  health: RuntimeHealthDto | null,
  healthFetchFailed: boolean,
  queueHealth: "ok" | "degraded" | "unknown",
  lastErrorMessage: string | null,
): RuntimeConnectionState {
  return buildRuntimeConnectionState({
    health,
    healthError: healthFetchFailed || (health != null && !health.ok),
    queueHealth,
    lastError: lastErrorMessage,
  });
}

export const useRuntimeConnectionStore = create<RuntimeConnectionStore>(
  (set, get) => ({
    connection: compute(null, true, "unknown", null),
    lastHealth: null,
    lastHealthFetchFailed: true,
    queueHealth: "unknown",
    lastErrorMessage: null,
    ingestProbeResult: ({
      health,
      healthFetchFailed,
      healthErrorMessage,
      queueHealth,
    }) => {
      const s = get();
      set({
        lastHealth: health,
        lastHealthFetchFailed: healthFetchFailed,
        queueHealth,
        lastErrorMessage: healthErrorMessage,
        connection: compute(
          health,
          healthFetchFailed,
          queueHealth,
          healthErrorMessage,
        ),
      });
    },
  }),
);
