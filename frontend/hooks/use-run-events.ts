"use client";

import { useMemo } from "react";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import { useRuntimeEvents } from "@/hooks/use-runtime-events";
import { useRuns } from "@/hooks/use-runs";
import { useRunSummary } from "@/hooks/use-run-summary";
import { eventBelongsToRunSelection } from "@/lib/runtime/adapters/run-event-filter";
import { resolvedRunFetchKey } from "@/lib/runtime/run-selection";
import {
  auditEntryToRuntimeEvent,
  useRuntimeActionAuditStore,
} from "@/stores/runtime-action-audit-store";
import {
  clarificationAuditToRuntimeEvent,
  useClarificationAuditStore,
} from "@/stores/clarification-audit-store";
import {
  executionAuditToRuntimeEvent,
  useExecutionAuditStore,
} from "@/stores/execution-audit-store";
import {
  strategyAuditToRuntimeEvent,
  useStrategyAuditStore,
} from "@/stores/strategy-audit-store";
import {
  intakeAuditToRuntimeEvent,
  useIntakeAuditStore,
} from "@/stores/intake-audit-store";
import { useRuntimeLiveEventsStore } from "@/stores/runtime-live-events-store";
import { dedupeRuntimeEvents } from "@/lib/runtime/observability/dedupe-runtime-events";

export type RunEventsResult = {
  events: RuntimeEventDto[];
  source: "runtime" | "offline";
};

export function useRunEvents(
  projectId: string | null,
  selectedRunId: string | null,
) {
  const rq = useRuns(projectId);
  const summary = useRunSummary(projectId, selectedRunId);
  const runKeyForFetch = resolvedRunFetchKey(summary, selectedRunId);
  const eq = useRuntimeEvents(projectId, runKeyForFetch);
  const auditEntries = useRuntimeActionAuditStore((s) => s.entries);
  const clarifyEntries = useClarificationAuditStore((s) => s.entries);
  const execEntries = useExecutionAuditStore((s) => s.entries);
  const strategyEntries = useStrategyAuditStore((s) => s.entries);
  const intakeEntries = useIntakeAuditStore((s) => s.entries);
  const liveOrderLen = useRuntimeLiveEventsStore((s) => s.order.length);

  return useMemo((): RunEventsResult => {
    const src = rq.data?.source ?? "offline";

    if (!selectedRunId) {
      return { events: [], source: src === "runtime" ? "runtime" : "offline" };
    }

    if (src !== "runtime" || eq.data?.source !== "runtime") {
      const runKey = summary?.runId ?? summary?.id ?? selectedRunId;
      const clarifyEvents = clarifyEntries
        .filter(
          (e) =>
            e.jobId === runKey ||
            e.runId === runKey ||
            e.jobId === selectedRunId,
        )
        .map(clarificationAuditToRuntimeEvent);
      const execEvents = execEntries
        .filter(
          (e) =>
            e.jobId === runKey ||
            e.runId === runKey ||
            e.jobId === selectedRunId,
        )
        .map(executionAuditToRuntimeEvent);
      const strategyEvents = strategyEntries
        .filter(
          (e) =>
            e.jobId === runKey ||
            e.runId === runKey ||
            e.jobId === selectedRunId,
        )
        .map(strategyAuditToRuntimeEvent);
      const intakeEvents = intakeEntries
        .filter((e) => e.runId === runKey || e.runId === selectedRunId)
        .map(intakeAuditToRuntimeEvent);
      return {
        events: dedupeRuntimeEvents([
          ...intakeEvents,
          ...clarifyEvents,
          ...execEvents,
          ...strategyEvents,
        ]),
        source: "offline",
      };
    }

    const all = eq.data?.events ?? [];
    const scoped = all.filter((ev) =>
      eventBelongsToRunSelection(ev, selectedRunId, summary),
    );
    const runKey = summary?.runId ?? summary?.id ?? selectedRunId;
    const auditEvents = auditEntries
      .filter(
        (e) =>
          e.jobId === runKey ||
          e.runId === runKey ||
          e.jobId === selectedRunId ||
          e.runId === summary?.runId,
      )
      .map(auditEntryToRuntimeEvent);
    const clarifyEvents = clarifyEntries
      .filter(
        (e) =>
          e.jobId === runKey ||
          e.runId === runKey ||
          e.jobId === selectedRunId ||
          e.runId === summary?.runId,
      )
      .map(clarificationAuditToRuntimeEvent);
    const execEvents = execEntries
      .filter(
        (e) =>
          e.jobId === runKey ||
          e.runId === runKey ||
          e.jobId === selectedRunId ||
          e.runId === summary?.runId,
      )
      .map(executionAuditToRuntimeEvent);
    const strategyEvents = strategyEntries
      .filter(
        (e) =>
          e.jobId === runKey ||
          e.runId === runKey ||
          e.jobId === selectedRunId ||
          e.runId === summary?.runId,
      )
      .map(strategyAuditToRuntimeEvent);
    const intakeEvents = intakeEntries
      .filter((e) => e.runId === runKey || e.runId === selectedRunId || e.runId === summary?.runId)
      .map(intakeAuditToRuntimeEvent);
    const withAudit = [
      ...scoped,
      ...auditEvents,
      ...intakeEvents,
      ...clarifyEvents,
      ...execEvents,
      ...strategyEvents,
    ];
    const merged = dedupeRuntimeEvents(
      useRuntimeLiveEventsStore.getState().getMerged(withAudit),
    );
    return { events: merged, source: "runtime" };
  }, [
    eq.data?.events,
    eq.data?.source,
    rq.data?.source,
    selectedRunId,
    summary,
    auditEntries,
    clarifyEntries,
    execEntries,
    strategyEntries,
    intakeEntries,
    liveOrderLen,
  ]);
}
