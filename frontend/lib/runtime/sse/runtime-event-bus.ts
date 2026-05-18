import type { QueryClient } from "@tanstack/react-query";
import type { ApiRuntimeEventRow } from "@/lib/api/runtime-types";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { mapApiEventToDto } from "@/lib/runtime/adapters/map-event";
import {
  applyExecutionLiveEvent,
  isExecutionLiveEventType,
  isTerminalExecutionEvent,
} from "@/lib/runtime/execution/execution-live-sync";
import { applyOrchestrationLiveEvent } from "@/lib/runtime/orchestration/orchestration-live-sync";
import {
  applyRecoveryLiveEvent,
  isRecoveryLiveEventType,
} from "@/lib/runtime/orchestration/runtime-recovery-live-sync";
import { runtimeEventDedupeKey } from "@/lib/runtime/sse/runtime-sse-events";
import { useRuntimeLiveEventsStore } from "@/stores/runtime-live-events-store";

const seenKeys = new Set<string>();
const MAX_SEEN = 600;
let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRunIds = new Set<string>();
let pendingTerminal = false;

function trimSeen() {
  if (seenKeys.size <= MAX_SEEN) return;
  const arr = [...seenKeys];
  seenKeys.clear();
  for (const k of arr.slice(-Math.floor(MAX_SEEN * 0.7))) {
    seenKeys.add(k);
  }
}

/**
 * Publica evento SSE no buffer live + invalidação coordenada (throttle).
 */
export function publishSseRuntimeEvent(
  row: ApiRuntimeEventRow,
  qc: QueryClient,
  opts?: { projectId?: string | null },
): boolean {
  const key = runtimeEventDedupeKey(row);
  if (seenKeys.has(key)) return false;
  seenKeys.add(key);
  trimSeen();

  const dto = mapApiEventToDto(row);
  const added = useRuntimeLiveEventsStore.getState().upsert(dto);
  if (!added) return false;

  if (isRecoveryLiveEventType(row.type)) {
    applyRecoveryLiveEvent(row);
  }
  if (isExecutionLiveEventType(row.type)) {
    applyExecutionLiveEvent(row);
    applyOrchestrationLiveEvent(row);
  }

  const runId =
    row && typeof row === "object" && "runId" in row && row.runId != null
      ? String(row.runId)
      : null;
  scheduleInvalidation(qc, opts?.projectId ?? null, runId, row.type);
  return true;
}

function scheduleInvalidation(
  qc: QueryClient,
  projectId: string | null,
  runId?: string | null,
  eventType?: string,
) {
  if (runId) pendingRunIds.add(runId);
  if (
    eventType &&
    (isTerminalExecutionEvent(eventType) ||
      isRecoveryLiveEventType(eventType))
  ) {
    pendingTerminal = true;
  }

  if (invalidateTimer != null) return;

  const delay = pendingTerminal ? 120 : 750;
  invalidateTimer = setTimeout(() => {
    invalidateTimer = null;
    const runIds = [...pendingRunIds];
    const terminal = pendingTerminal;
    pendingRunIds = new Set();
    pendingTerminal = false;

    void qc.invalidateQueries({
      queryKey: runtimeQueryKeys.root,
      refetchType: "active",
    });
    if (projectId) {
      void qc.invalidateQueries({
        queryKey: runtimeQueryKeys.projectRuns(projectId),
      });
    }
    for (const rid of runIds) {
      void qc.invalidateQueries({
        queryKey: runtimeQueryKeys.execution(rid),
      });
      void qc.invalidateQueries({
        queryKey: runtimeQueryKeys.strategy(rid),
      });
      void qc.invalidateQueries({
        queryKey: runtimeQueryKeys.clarification(rid),
      });
      void qc.invalidateQueries({
        queryKey: runtimeQueryKeys.runEvidence(rid),
      });
      if (terminal) {
        void qc.refetchQueries({
          queryKey: runtimeQueryKeys.execution(rid),
        });
      }
    }
  }, delay);
}

export function resetRuntimeEventBus(): void {
  seenKeys.clear();
  pendingRunIds = new Set();
  pendingTerminal = false;
  if (invalidateTimer != null) {
    clearTimeout(invalidateTimer);
    invalidateTimer = null;
  }
  useRuntimeLiveEventsStore.getState().clear();
}
