"use client";

import { useMemo, useState, useEffect } from "react";
import { useRunEvents } from "@/hooks/use-run-events";
import { useRunSummary } from "@/hooks/use-run-summary";
import { deriveRunOperationalTimeline } from "@/lib/runtime/observability/derive-run-operational-timeline";
import type { RunOperationalTimeline } from "@/lib/runtime/observability/derive-run-operational-timeline";
import { useRuntimeObservabilityLogsStore } from "@/stores/runtime-observability-logs-store";

export function useRunOperationalTimeline(
  projectId: string | null,
  selectedRunId: string | null,
): RunOperationalTimeline & { runKey: string | null; isEmpty: boolean } {
  const summary = useRunSummary(projectId, selectedRunId);
  const runKey = summary?.runId ?? summary?.id ?? selectedRunId;
  const { events } = useRunEvents(projectId, selectedRunId);
  const daemonBucketLen = useRuntimeObservabilityLogsStore((s) =>
    runKey ? (s.buckets.get(runKey)?.order.length ?? 0) : 0,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const daemonEntries = runKey
      ? useRuntimeObservabilityLogsStore.getState().getDaemonEntries(runKey)
      : [];
    const timeline = deriveRunOperationalTimeline({
      events,
      daemonEntries,
      runKey,
      nowMs: now,
    });
    return {
      ...timeline,
      runKey,
      isEmpty: timeline.items.length === 0,
    };
  }, [events, runKey, now, daemonBucketLen]);
}
