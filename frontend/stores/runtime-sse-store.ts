import { create } from "zustand";
import type { RuntimeSsePhase } from "@/lib/runtime/sse/runtime-sse-types";
import { SSE_HEARTBEAT_STALE_MS } from "@/lib/runtime/sse/runtime-sse-types";

type RuntimeSseStore = {
  phase: RuntimeSsePhase;
  reconnectAttempt: number;
  lastHeartbeatAt: number | null;
  lastEventAt: number | null;
  lastError: string | null;
  setPhase: (phase: RuntimeSsePhase) => void;
  touchHeartbeat: (ts?: number) => void;
  touchEvent: () => void;
  setError: (msg: string | null) => void;
  reset: () => void;
  isStale: () => boolean;
};

export const useRuntimeSseStore = create<RuntimeSseStore>((set, get) => ({
  phase: "idle",
  reconnectAttempt: 0,
  lastHeartbeatAt: null,
  lastEventAt: null,
  lastError: null,
  setPhase: (phase) =>
    set((s) => ({
      phase,
      reconnectAttempt:
        phase === "reconnecting" ? s.reconnectAttempt + 1 : s.reconnectAttempt,
    })),
  touchHeartbeat: (ts) =>
    set({
      lastHeartbeatAt: ts ?? Date.now(),
      lastError: null,
    }),
  touchEvent: () =>
    set({
      lastEventAt: Date.now(),
    }),
  setError: (msg) => set({ lastError: msg }),
  reset: () =>
    set({
      phase: "idle",
      reconnectAttempt: 0,
      lastHeartbeatAt: null,
      lastEventAt: null,
      lastError: null,
    }),
  isStale: () => {
    const { lastHeartbeatAt, phase } = get();
    if (phase !== "connected" && phase !== "degraded") return false;
    if (lastHeartbeatAt == null) return false;
    return Date.now() - lastHeartbeatAt > SSE_HEARTBEAT_STALE_MS;
  },
}));
