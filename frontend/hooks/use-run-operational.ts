"use client";

import { useMemo } from "react";
import type { RunSummaryDto, RuntimeEventDto } from "@/lib/api/runtime-types";
import type { RuntimeUiState } from "@/lib/runtime/runtime-ui-types";
import type { IntegrityUiState } from "@/lib/runtime/adapters/runtime-labels";

export type RunOperationalVm = {
  runKey: string;
  taskTitle: string;
  currentPhaseRaw: string;
  runtimeState: RuntimeUiState;
  lastEvent: RuntimeEventDto | null;
  startedAtLabel: string | null;
  updatedAtLabel: string | null;
  warningsCount: number;
  errorsCount: number;
  integrity: IntegrityUiState;
};

function lastIso(events: RuntimeEventDto[]): string | null {
  if (!events.length) return null;
  let best = events[0].tsIso;
  for (const e of events) {
    if (Date.parse(e.tsIso) >= Date.parse(best)) best = e.tsIso;
  }
  return best;
}

function deriveIntegrity(
  events: RuntimeEventDto[],
  connectionDegraded: boolean,
): IntegrityUiState {
  if (connectionDegraded) return "degraded";
  const rev = [...events].reverse();
  const bad = rev.find((e) => e.channel === "integrity" && e.severity !== "info");
  if (bad?.severity === "error") return "failed";
  if (bad?.severity === "warn") return "degraded";
  const ok = rev.find((e) => e.channel === "integrity");
  if (ok) return "ok";
  return "unknown";
}

export function useRunOperational(
  summary: RunSummaryDto | null,
  scopedEvents: RuntimeEventDto[],
  connectionDegraded: boolean,
): RunOperationalVm | null {
  return useMemo(() => {
    if (!summary) return null;
    const warningsCount = scopedEvents.filter((e) => e.severity === "warn").length;
    const errorsCount = scopedEvents.filter((e) => e.severity === "error").length;
    const sorted = [...scopedEvents].sort(
      (a, b) => Date.parse(a.tsIso) - Date.parse(b.tsIso),
    );
    const lastEvent = sorted.length ? sorted[sorted.length - 1] : null;
    const lastIsoVal = lastIso(sorted);
    const updatedAtLabel = lastIsoVal
      ? new Date(lastIsoVal).toLocaleTimeString("pt-PT", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      : null;

    return {
      runKey: summary.runId ?? summary.id,
      taskTitle: summary.label,
      currentPhaseRaw: summary.phase,
      runtimeState: summary.state,
      lastEvent,
      startedAtLabel: summary.startedAtLabel,
      updatedAtLabel,
      warningsCount,
      errorsCount,
      integrity: deriveIntegrity(scopedEvents, connectionDegraded),
    };
  }, [summary, scopedEvents, connectionDegraded]);
}
