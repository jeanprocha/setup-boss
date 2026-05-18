import type { ApiRuntimeEventRow } from "@/lib/api/runtime-types";
import { applyOrchestrationLiveEvent } from "@/lib/runtime/orchestration/orchestration-live-sync";
import type { RuntimeRecoveryStatus } from "@/lib/runtime/orchestration/orchestration-types";
import { useOrchestrationStore } from "@/stores/orchestration-store";

export const RECOVERY_LIVE_EVENT_TYPES = new Set([
  "runtime_recovered",
  "runtime_stale",
  "runtime_orphaned",
  "recovery_started",
  "recovery_completed",
  "recovery_failed",
  "daemon_recovery_started",
  "daemon_recovery_completed",
]);

export function isRecoveryLiveEventType(type: string): boolean {
  return RECOVERY_LIVE_EVENT_TYPES.has(type.toLowerCase());
}

function readRecoveryStatus(data: Record<string, unknown>): RuntimeRecoveryStatus {
  const s = String(data.recoveryStatus || data.recovery_status || "").trim();
  if (
    s === "recovered" ||
    s === "stale" ||
    s === "orphaned" ||
    s === "recovery_pending" ||
    s === "recovery_failed"
  ) {
    return s;
  }
  const t = String(data.type || "").toLowerCase();
  if (t === "runtime_stale") return "stale";
  if (t === "runtime_orphaned") return "orphaned";
  if (t === "recovery_failed") return "recovery_failed";
  if (t === "recovery_started") return "recovery_pending";
  return "recovered";
}

export function applyRecoveryLiveEvent(row: ApiRuntimeEventRow): boolean {
  if (!isRecoveryLiveEventType(row.type)) return false;

  const runId = row.runId != null ? String(row.runId) : null;
  const d =
    row.data && typeof row.data === "object"
      ? (row.data as Record<string, unknown>)
      : {};

  if (runId) {
    const store = useOrchestrationStore.getState();
    const prev = store.lastBootstrap;
    if (!prev || prev.runId === runId) {
      const status = readRecoveryStatus(d);
      store.setLastBootstrap({
        runId,
        jobId: row.jobId != null ? String(row.jobId) : prev?.jobId ?? null,
        executionState: prev?.executionState ?? "execution_running",
        orchestrationState: prev?.orchestrationState ?? "execution_running",
        startedAt: prev?.startedAt ?? null,
        workerId: prev?.workerId ?? null,
        currentPhase: prev?.currentPhase ?? null,
        recoveryStatus: status,
        recoveryReasons: Array.isArray(d.recoveryReasons)
          ? (d.recoveryReasons as unknown[]).map(String)
          : prev?.recoveryReasons ?? [],
      });
    }
    applyOrchestrationLiveEvent(row);
    return true;
  }

  return row.type === "recovery_completed" || row.type === "daemon_recovery_completed";
}
