"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import {
  deriveRuntimeStallVisual,
  type DeriveRuntimeStallVisualInput,
  type RuntimeStallVisual,
} from "@/lib/runtime/observability/derive-runtime-stall-visual";
import { deriveRuntimeOperationalContext } from "@/lib/runtime/observability/derive-runtime-operational-context";
import { useRuntimeHeartbeatSnapshot } from "@/hooks/use-runtime-heartbeat";

export type UseRuntimeStallVisualOptions = Omit<
  DeriveRuntimeStallVisualInput,
  | "nowMs"
  | "daemonRunning"
  | "daemonAlive"
  | "activelyProcessing"
  | "workerIdleNoJob"
  | "runningJobsCount"
  | "currentJobId"
  | "currentRunId"
  | "workerState"
> & {
  /** Sinal UI de que a etapa deveria estar em curso (antes do heartbeat). */
  uiActivelyProcessing: boolean;
  /** Quando false, não avança o relógio (economiza re-renders). */
  tick?: boolean;
};

export function useRuntimeStallVisual(
  opts: UseRuntimeStallVisualOptions,
): RuntimeStallVisual & {
  operational: ReturnType<typeof deriveRuntimeOperationalContext>;
} {
  const { tick = true, runtimePhase, uiActivelyProcessing, runKey, ...rest } = opts;
  const [now, setNow] = useState(() => Date.now());
  const phaseRef = useRef<string | null>(null);
  const [phaseBumpAtMs, setPhaseBumpAtMs] = useState<number | null>(null);
  const { heartbeat } = useRuntimeHeartbeatSnapshot();

  const operational = useMemo(
    () =>
      deriveRuntimeOperationalContext({
        heartbeat,
        runKey,
        uiActivelyProcessing,
      }),
    [heartbeat, runKey, uiActivelyProcessing],
  );

  useEffect(() => {
    const p = runtimePhase ?? null;
    if (phaseRef.current != null && p !== phaseRef.current) {
      setPhaseBumpAtMs(Date.now());
    }
    phaseRef.current = p;
  }, [runtimePhase]);

  useEffect(() => {
    if (!tick || !operational.isRunActivelyProcessing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tick, operational.isRunActivelyProcessing]);

  const stall = useMemo(
    () =>
      deriveRuntimeStallVisual({
        ...rest,
        runtimePhase,
        runKey,
        nowMs: now,
        phaseBumpAtMs,
        activelyProcessing: operational.isRunActivelyProcessing,
        workerIdleNoJob: operational.workerIdleNoJob,
        runningJobsCount: heartbeat?.runningJobsCount ?? null,
        currentJobId: heartbeat?.currentJobId ?? null,
        currentRunId: heartbeat?.currentRunId ?? null,
        workerState: heartbeat?.workerState ?? operational.workerState,
        daemonAlive: operational.daemonAlive,
        daemonRunning: operational.daemonAlive,
      }),
    [rest, runtimePhase, runKey, now, phaseBumpAtMs, operational, heartbeat],
  );

  return { ...stall, operational };
}

export function useRuntimeStallVisualFromEvents(
  events: RuntimeEventDto[],
  opts: UseRuntimeStallVisualOptions,
): RuntimeStallVisual & {
  operational: ReturnType<typeof deriveRuntimeOperationalContext>;
} {
  return useRuntimeStallVisual({ ...opts, events });
}
