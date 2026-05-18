import type { RuntimeUxEvent, RuntimeUxKind } from "./runtime-ux-types.ts";

export type RuntimeEventVisibility = "operational" | "technical" | "hidden";

const OPERATIONAL_KINDS = new Set<RuntimeUxKind>([
  "intake",
  "clarification",
  "plan",
  "approval",
  "git",
  "strategy",
  "execution",
  "review",
  "correction",
  "knowledge",
  "workspace",
]);

const HIDDEN_EXACT_TYPES = new Set([
  "scheduler_tick",
  "maintenance_queue_pruned",
  "maintenance_events_pruned",
  "worker_idle",
  "worker_busy",
  "worker_started",
  "worker_stopping",
  "worker_stopped",
  "workspace_run_sync.tick",
  "workspace_run_sync.summary",
  "workspace_run_sync.backoff",
  "job_available",
  "job_scheduled",
  "job_delayed",
  "job_claimed",
  "retry_available",
  "retry_scheduled",
  "delayed_job_recovered",
  "heartbeat",
  "connected",
  "stream-open",
  "job_started",
  "job_completed",
  "job_enqueued",
  "recurring_job_skipped",
  "workspace_run_sync.completed",
  "workspace_run_sync.waiting",
  "workspace_run_sync.advance",
]);

const HIDDEN_TYPE_PATTERNS = [
  /^workspace_run_sync\./i,
  /^stream-/i,
  /^sse_/i,
  /^job_(claimed|available|scheduled|delayed|requeued)$/i,
  /^recurring_job_/i,
];

const TECHNICAL_TYPE_PATTERNS = [
  /^runtime\.output_dir_resolved$/i,
  /^runtime\.projects\./i,
  /^runtime\.emit\./i,
  /^runtime\.strategy_/i,
  /^governance/i,
  /^validation/i,
  /^daemon_/i,
  /^maintenance_/i,
  /^scheduler_/i,
  /^recurring_job_/i,
  /integrity_check/i,
  /preflight/i,
  /clarification_initialized$/i,
  /strategy_waiting_user_action/i,
];

const OPERATIONAL_WORKSPACE_TYPES = new Set([
  "workspace_run.started",
  "workspace_run.advanced",
  "workspace_run.waiting_user_action",
  "workspace_run.completed",
  "workspace_run.failed",
  "workspace_run.error",
  "workspace_run.updated",
  "workspace_run.git_updated",
]);

function readRawType(event: RuntimeUxEvent): string {
  const raw = event.raw as { type?: string; eventType?: string } | undefined;
  return String(raw?.type ?? raw?.eventType ?? "").toLowerCase();
}

function payloadByteEstimate(event: RuntimeUxEvent): number {
  try {
    const raw = event.raw;
    if (!raw) return 0;
    return JSON.stringify(raw).length;
  } catch {
    return 0;
  }
}

/** Eventos com payload enorme não entram no feed humano (continuam no debug). */
const MAX_OPERATIONAL_PAYLOAD_BYTES = 12_000;

/**
 * Classifica visibilidade UX de um evento normalizado (UX-A).
 * Nada é apagado do runtime — só roteamento de UI.
 */
export function classifyRuntimeEventVisibility(
  event: RuntimeUxEvent,
): RuntimeEventVisibility {
  const rawType = readRawType(event);

  if (HIDDEN_EXACT_TYPES.has(rawType)) return "hidden";
  if (HIDDEN_TYPE_PATTERNS.some((p) => p.test(rawType))) return "hidden";

  if (/^operational_(finalization|review)_/.test(rawType)) {
    return payloadByteEstimate(event) > MAX_OPERATIONAL_PAYLOAD_BYTES
      ? "technical"
      : "operational";
  }

  if (TECHNICAL_TYPE_PATTERNS.some((p) => p.test(rawType))) {
    return "technical";
  }

  if (event.kind === "system" || event.kind === "unknown") {
    return "technical";
  }

  if (event.kind === "workspace") {
    if (OPERATIONAL_WORKSPACE_TYPES.has(rawType)) {
      return payloadByteEstimate(event) > MAX_OPERATIONAL_PAYLOAD_BYTES
        ? "technical"
        : "operational";
    }
    return "technical";
  }

  if (!OPERATIONAL_KINDS.has(event.kind)) {
    return "technical";
  }

  if (
    event.phase === "info" &&
    event.kind !== "intake" &&
    event.kind !== "git" &&
    event.kind !== "approval"
  ) {
    return "technical";
  }

  if (payloadByteEstimate(event) > MAX_OPERATIONAL_PAYLOAD_BYTES) {
    return "technical";
  }

  return "operational";
}

export function filterOperationalUxEvents(
  events: readonly RuntimeUxEvent[],
): RuntimeUxEvent[] {
  return events.filter(
    (e) => classifyRuntimeEventVisibility(e) === "operational",
  );
}

export function isHiddenRawEventType(type: string): boolean {
  const t = type.toLowerCase();
  if (HIDDEN_EXACT_TYPES.has(t)) return true;
  return HIDDEN_TYPE_PATTERNS.some((p) => p.test(t));
}
