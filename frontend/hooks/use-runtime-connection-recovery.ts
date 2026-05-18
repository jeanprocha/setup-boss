"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

/**
 * Quando o runtime volta a ficar reachable, reactiva heartbeat e read models activos.
 */
export function useRuntimeConnectionRecovery(
  projectId: string | null,
  selectedRunKey: string | null,
) {
  const qc = useQueryClient();
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const prevReachable = useRef(reachable);

  useEffect(() => {
    const wasDown = prevReachable.current === false;
    prevReachable.current = reachable;
    if (!wasDown || !reachable) return;

    void qc.invalidateQueries({ queryKey: runtimeQueryKeys.heartbeat() });
    void qc.refetchQueries({ queryKey: runtimeQueryKeys.heartbeat() });
    void qc.invalidateQueries({
      queryKey: runtimeQueryKeys.root,
      refetchType: "active",
    });
    if (projectId) {
      void qc.invalidateQueries({
        queryKey: runtimeQueryKeys.events(projectId, 150),
      });
    }
    if (selectedRunKey) {
      void Promise.all([
        qc.refetchQueries({
          queryKey: runtimeQueryKeys.strategy(selectedRunKey),
        }),
        qc.refetchQueries({
          queryKey: runtimeQueryKeys.clarification(selectedRunKey),
        }),
        qc.refetchQueries({
          queryKey: runtimeQueryKeys.execution(selectedRunKey),
        }),
        qc.refetchQueries({
          queryKey: runtimeQueryKeys.runObservabilityBundle(selectedRunKey),
        }),
      ]);
    }
  }, [reachable, projectId, selectedRunKey, qc]);
}
