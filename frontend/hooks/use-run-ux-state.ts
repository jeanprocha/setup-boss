"use client";

import { useEffect, useMemo, useState } from "react";
import { useRunEvents } from "@/hooks/use-run-events";
import { deriveRunUxState } from "@/lib/runtime/ux/derive-run-ux-state";
import { normalizeRuntimeUxEvents } from "@/lib/runtime/ux/normalize-runtime-event";
import type { RunUxState } from "@/lib/runtime/ux/runtime-ux-types";

/**
 * Estado UX operacional derivado dos eventos da corrida.
 * Não substitui timeline/observabilidade existentes — fundação para UX-B+.
 */
export function useRunUxState(
  projectId: string | null,
  selectedRunId: string | null,
): RunUxState {
  const { events } = useRunEvents(projectId, selectedRunId);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const uxEvents = normalizeRuntimeUxEvents(events);
    return deriveRunUxState(uxEvents, { nowMs });
  }, [events, nowMs]);
}
