import type { ApiRuntimeEventRow } from "@/lib/api/runtime-types";

export type RuntimeSsePhase =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "degraded";

export const SSE_HEARTBEAT_STALE_MS = 45_000;

export const SSE_RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;

export type RuntimeSseConnectedPayload = {
  ok?: boolean;
  ts?: string;
  projectId?: string | null;
};

export type RuntimeSseHeartbeatPayload = {
  ts?: string;
};

export type RuntimeSseEventPayload = {
  ok?: boolean;
  event?: ApiRuntimeEventRow;
};

export type RuntimeSseHandlers = {
  onPhase: (phase: RuntimeSsePhase) => void;
  onConnected: (payload: RuntimeSseConnectedPayload) => void;
  onHeartbeat: (payload: RuntimeSseHeartbeatPayload) => void;
  onRuntimeEvent: (row: ApiRuntimeEventRow) => void;
  onError: (message: string) => void;
};
