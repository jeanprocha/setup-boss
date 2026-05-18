"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RUNTIME_API_PROXY_PREFIX } from "@/lib/api/runtime-config";
import { WorkspaceRunSseClient } from "@/lib/workspace/sse/workspace-run-sse-client";
import { invalidateWorkspaceRunQueries } from "@/lib/workspace/sse/workspace-run-sse-invalidation";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { useWorkspaceRunSseStore } from "@/stores/workspace-run-sse-store";

function buildWorkspaceStreamUrl(workspaceId: string | null): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  const qs = params.toString();
  return `${RUNTIME_API_PROXY_PREFIX}/events/stream${qs ? `?${qs}` : ""}`;
}

/**
 * SSE dedicado a workspace_run.* — complementa polling; não substitui refresh manual.
 */
export function useWorkspaceRunSse(workspaceId: string | null) {
  const qc = useQueryClient();
  const clientRef = useRef<WorkspaceRunSseClient | null>(null);
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const setPhase = useWorkspaceRunSseStore((s) => s.setPhase);
  const setError = useWorkspaceRunSseStore((s) => s.setError);
  const reset = useWorkspaceRunSseStore((s) => s.reset);

  const enabled = reachable;

  useEffect(() => {
    if (!enabled) {
      clientRef.current?.disconnect();
      clientRef.current = null;
      reset();
      setPhase("disconnected");
      return;
    }

    const client = new WorkspaceRunSseClient();
    clientRef.current = client;
    const url = buildWorkspaceStreamUrl(workspaceId);

    client.connect(url, {
      onPhase: (phase) => {
        setPhase(phase);
        if (phase === "disconnected") setError("Stream desligado");
      },
      onWorkspaceRunEvent: (payload) => {
        setError(null);
        invalidateWorkspaceRunQueries(qc, payload);
      },
      onError: (msg) => {
        setError(msg);
        if (useWorkspaceRunSseStore.getState().phase === "connected") {
          setPhase("reconnecting");
        }
      },
    });

    return () => {
      client.disconnect();
      clientRef.current = null;
      reset();
    };
  }, [enabled, workspaceId, qc, reset, setError, setPhase]);
}
