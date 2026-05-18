"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { refetchRunReadModels } from "@/lib/runtime/orchestration/refetch-run-read-models";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

/** Reopen / troca de run: refetch read models do run seleccionado. */
export function useRunSelectionResync(runKey: string | null) {
  const qc = useQueryClient();
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const prevKey = useRef<string | null>(null);
  const prevReachable = useRef(reachable);

  const refetchRun = () => {
    if (!runKey) return;
    void refetchRunReadModels(qc, runKey);
  };

  useEffect(() => {
    if (!runKey || !reachable) {
      prevKey.current = runKey;
      prevReachable.current = reachable;
      return;
    }
    const runChanged = prevKey.current !== runKey;
    const recovered = prevReachable.current === false;
    prevKey.current = runKey;
    prevReachable.current = reachable;
    if (!runChanged && !recovered) return;
    refetchRun();
  }, [runKey, reachable, qc]);
}
