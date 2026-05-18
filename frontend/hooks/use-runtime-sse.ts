"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RUNTIME_API_PROXY_PREFIX } from "@/lib/api/runtime-config";
import { RuntimeSseClient } from "@/lib/runtime/sse/runtime-sse-client";
import { publishSseRuntimeEvent } from "@/lib/runtime/sse/runtime-event-bus";
import { SSE_HEARTBEAT_STALE_MS } from "@/lib/runtime/sse/runtime-sse-types";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { useRuntimeSseStore } from "@/stores/runtime-sse-store";
import {
  resetRuntimeEventBus,
} from "@/lib/runtime/sse/runtime-event-bus";
import { resyncRuntimeAfterReconnect } from "@/lib/runtime/orchestration/runtime-resync";
import { useRuntimeLiveEventsStore } from "@/stores/runtime-live-events-store";

function buildStreamUrl(projectId: string): string {
  const params = new URLSearchParams();
  params.set("projectId", projectId);
  return `${RUNTIME_API_PROXY_PREFIX}/events/stream?${params.toString()}`;
}

/**
 * Mantém ligação SSE ao runtime (complementa polling — não substitui source-of-truth).
 */
export function useRuntimeSse(
  projectId: string | null,
  selectedRunKey?: string | null,
) {
  const qc = useQueryClient();
  const clientRef = useRef<RuntimeSseClient | null>(null);
  const selectedRunKeyRef = useRef(selectedRunKey ?? null);
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  useEffect(() => {
    selectedRunKeyRef.current = selectedRunKey ?? null;
  }, [selectedRunKey]);

  const setPhase = useRuntimeSseStore((s) => s.setPhase);
  const touchHeartbeat = useRuntimeSseStore((s) => s.touchHeartbeat);
  const touchEvent = useRuntimeSseStore((s) => s.touchEvent);
  const setError = useRuntimeSseStore((s) => s.setError);
  const reset = useRuntimeSseStore((s) => s.reset);

  const enabled = Boolean(projectId) && reachable;

  useEffect(() => {
    if (!enabled || !projectId) {
      clientRef.current?.disconnect();
      clientRef.current = null;
      reset();
      resetRuntimeEventBus();
      setPhase("disconnected");
      return;
    }

    const client = new RuntimeSseClient();
    clientRef.current = client;
    const url = buildStreamUrl(projectId);

    client.connect(url, {
      onPhase: (phase) => {
        setPhase(phase);
        if (phase === "disconnected") {
          setError("Stream desligado");
        }
      },
      onConnected: () => {
        touchHeartbeat(Date.now());
        setError(null);
        const store = useRuntimeSseStore.getState();
        const liveEmpty =
          useRuntimeLiveEventsStore.getState().order.length === 0;
        if (
          store.reconnectAttempt > 0 ||
          store.phase === "reconnecting" ||
          liveEmpty
        ) {
          void resyncRuntimeAfterReconnect(qc, {
            projectId,
            selectedRunKey: selectedRunKeyRef.current,
          });
        }
      },
      onHeartbeat: (p) => {
        const t = p.ts ? Date.parse(p.ts) : Date.now();
        touchHeartbeat(Number.isFinite(t) ? t : Date.now());
        const store = useRuntimeSseStore.getState();
        if (store.phase === "degraded") {
          setPhase("connected");
        }
      },
      onRuntimeEvent: (row) => {
        touchEvent();
        publishSseRuntimeEvent(row, qc, { projectId });
      },
      onError: (msg) => {
        setError(msg);
        if (useRuntimeSseStore.getState().phase === "connected") {
          setPhase("degraded");
        }
      },
    });

    return () => {
      client.disconnect();
      clientRef.current = null;
      reset();
      resetRuntimeEventBus();
    };
  }, [
    enabled,
    projectId,
    qc,
    reset,
    setError,
    setPhase,
    touchEvent,
    touchHeartbeat,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const store = useRuntimeSseStore.getState();
      if (store.isStale() && store.phase === "connected") {
        store.setPhase("degraded");
      }
    }, Math.min(10_000, SSE_HEARTBEAT_STALE_MS / 3));
    return () => clearInterval(id);
  }, [enabled]);
}
