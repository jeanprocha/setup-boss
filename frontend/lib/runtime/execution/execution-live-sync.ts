import type { ApiRuntimeEventRow } from "@/lib/api/runtime-types";
import type { ExecutionAuditKind } from "@/stores/execution-audit-store";
import { useExecutionAuditStore } from "@/stores/execution-audit-store";

export const EXECUTION_LIVE_EVENT_TYPES = new Set([
  "execution_started",
  "execution_triggered",
  "review_started",
  "review_rejected",
  "review_completed",
  "correction_started",
  "correction_completed",
  "retry_started",
  "execution_completed",
  "execution_failed",
  "execution_recovered",
  "recovery_completed",
  "job_completed",
]);

const TERMINAL_EXECUTION_TYPES = new Set([
  "execution_completed",
  "execution_failed",
  "job_completed",
]);

export function isExecutionLiveEventType(type: string): boolean {
  const t = type.toLowerCase();
  if (EXECUTION_LIVE_EVENT_TYPES.has(t)) return true;
  if (t.includes("subtask") && (t.includes("execution") || t.includes("correction")))
    return true;
  return false;
}

export function isTerminalExecutionEvent(type: string): boolean {
  const t = type.toLowerCase();
  if (TERMINAL_EXECUTION_TYPES.has(t)) return true;
  if (t === "job_failed") return true;
  return false;
}

function mapEventToAuditKind(type: string): ExecutionAuditKind | null {
  const t = type.toLowerCase();
  const table: Record<string, ExecutionAuditKind> = {
    execution_started: "execution_started",
    execution_triggered: "execution_started",
    subtask_queued: "subtask_queued",
    subtask_running: "subtask_running",
    review_rejected: "review_rejected",
    review_started: "review_started",
    review_completed: "review_completed",
    correction_started: "correction_started",
    correction_completed: "correction_completed",
    retry_started: "retry_started",
    recovery_completed: "recovery_completed",
    execution_recovered: "execution_recovered",
    execution_completed: "execution_completed",
    execution_failed: "execution_failed",
    job_completed: "execution_completed",
    job_failed: "execution_failed",
  };
  return table[t] ?? null;
}

function readEventMessage(row: ApiRuntimeEventRow): string {
  const d = row.data && typeof row.data === "object" ? row.data : {};
  const msg = d.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  return row.type.replace(/_/g, " ");
}

function severityForType(type: string): "info" | "warn" | "error" {
  const t = type.toLowerCase();
  if (t.includes("fail") || t === "review_rejected") return "error";
  if (
    t.includes("correction") ||
    t.includes("retry") ||
    t === "review_started"
  )
    return "warn";
  return "info";
}

/** Actualiza audit store local para stream/timeline (sem duplicar por id SSE). */
export function applyExecutionLiveEvent(row: ApiRuntimeEventRow): boolean {
  if (!isExecutionLiveEventType(row.type)) return false;

  const kind = mapEventToAuditKind(row.type);
  if (!kind) return false;

  const runId = row.runId != null ? String(row.runId) : null;
  const jobId = row.jobId != null ? String(row.jobId) : null;
  const message = readEventMessage(row);

  const store = useExecutionAuditStore.getState();
  const recent = store.entries.slice(-6);
  const dup = recent.some(
    (e) => e.kind === kind && e.message === message && e.runId === runId,
  );
  if (dup) return false;

  store.push({
    kind,
    message,
    jobId,
    runId,
    severity: severityForType(row.type),
  });
  return true;
}
