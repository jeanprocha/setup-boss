import type { ApiRuntimeEventRow } from "@/lib/api/runtime-types";
import type {
  OrchestrationBootstrapDto,
  OrchestrationExecutionState,
  OrchestrationState,
} from "@/lib/runtime/orchestration/orchestration-types";
import { useOrchestrationStore } from "@/stores/orchestration-store";
import {
  isExecutionLiveEventType,
  isTerminalExecutionEvent,
} from "@/lib/runtime/execution/execution-live-sync";

function readString(
  data: Record<string, unknown>,
  key: string,
): string | null {
  const v = data[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asOrchestrationState(v: string | null): OrchestrationState | null {
  if (!v) return null;
  const allowed: OrchestrationState[] = [
    "ready_for_execution",
    "queued",
    "execution_starting",
    "execution_running",
    "execution_reviewing",
    "execution_correcting",
    "execution_blocked",
    "execution_failed",
    "execution_completed",
    "execution_recovering",
  ];
  return allowed.includes(v as OrchestrationState)
    ? (v as OrchestrationState)
    : null;
}

function asExecutionState(v: string | null): OrchestrationExecutionState | null {
  if (!v) return null;
  const allowed: OrchestrationExecutionState[] = [
    "ready_for_execution",
    "execution_starting",
    "execution_running",
    "execution_reviewing",
    "execution_correcting",
    "execution_blocked",
    "execution_failed",
    "execution_completed",
    "execution_recovering",
  ];
  return allowed.includes(v as OrchestrationExecutionState)
    ? (v as OrchestrationExecutionState)
    : null;
}

function inferFromEventType(type: string): {
  orchestrationState: OrchestrationState | null;
  executionState: OrchestrationExecutionState | null;
} {
  const t = type.toLowerCase();
  if (t === "execution_completed" || t === "job_completed") {
    return {
      orchestrationState: "execution_completed",
      executionState: "execution_completed",
    };
  }
  if (t === "execution_failed" || t === "job_failed") {
    return {
      orchestrationState: "execution_failed",
      executionState: "execution_failed",
    };
  }
  if (t === "review_started" || t === "review_rejected") {
    return {
      orchestrationState: "execution_reviewing",
      executionState: "execution_reviewing",
    };
  }
  if (t === "correction_started" || t === "correction_completed") {
    return {
      orchestrationState: "execution_correcting",
      executionState: "execution_correcting",
    };
  }
  if (t === "retry_started") {
    return {
      orchestrationState: "execution_running",
      executionState: "execution_running",
    };
  }
  if (t === "execution_recovered" || t === "recovery_completed") {
    return {
      orchestrationState: "execution_recovering",
      executionState: "execution_recovering",
    };
  }
  if (t === "execution_started" || t === "execution_triggered") {
    return {
      orchestrationState: "execution_running",
      executionState: "execution_running",
    };
  }
  return { orchestrationState: null, executionState: null };
}

/** Mantém bootstrap de orchestration alinhado com eventos SSE (optimistic). */
export function applyOrchestrationLiveEvent(row: ApiRuntimeEventRow): boolean {
  if (!isExecutionLiveEventType(row.type)) return false;

  const runId = row.runId != null ? String(row.runId) : null;
  if (!runId) return false;

  const store = useOrchestrationStore.getState();
  const prev = store.lastBootstrap;
  if (prev && prev.runId !== runId && !isTerminalExecutionEvent(row.type)) {
    return false;
  }

  const d =
    row.data && typeof row.data === "object"
      ? (row.data as Record<string, unknown>)
      : {};

  const fromData = {
    orchestrationState:
      asOrchestrationState(readString(d, "orchestrationState")) ??
      asOrchestrationState(readString(d, "orchestration_state")),
    executionState:
      asExecutionState(readString(d, "executionState")) ??
      asExecutionState(readString(d, "execution_state")),
  };

  const inferred = inferFromEventType(row.type);
  const orchestrationState =
    fromData.orchestrationState ?? inferred.orchestrationState;
  const executionState = fromData.executionState ?? inferred.executionState;

  if (!orchestrationState && !executionState) return false;

  const next: OrchestrationBootstrapDto = {
    runId,
    jobId: row.jobId != null ? String(row.jobId) : prev?.jobId ?? null,
    orchestrationState: orchestrationState ?? prev?.orchestrationState ?? "execution_running",
    executionState: executionState ?? prev?.executionState ?? "execution_running",
    startedAt: prev?.startedAt ?? row.timestamp ?? null,
    workerId: prev?.workerId ?? null,
    currentPhase:
      readString(d, "lifecyclePhase") ??
      readString(d, "lifecycle_phase") ??
      prev?.currentPhase ??
      null,
    idempotent: prev?.idempotent,
  };

  store.setLastBootstrap(next);
  return true;
}
