import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import { isHiddenRawEventType } from "@/lib/runtime/ux/classify-runtime-event-visibility.ts";

const NOISE = new Set([
  "scheduler_tick",
  "maintenance_queue_pruned",
  "maintenance_events_pruned",
  "worker_idle",
  "worker_busy",
  "heartbeat",
  "workspace_run_sync.tick",
  "workspace_run_sync.summary",
  "workspace_run_sync.backoff",
]);

export function isLowSignalEventType(type: string): boolean {
  const t = String(type || "").toLowerCase();
  if (NOISE.has(t)) return true;
  return isHiddenRawEventType(t);
}

export function pickLastImportantEvent(
  events: readonly RuntimeEventDto[],
): RuntimeEventDto | null {
  const rev = [...events].reverse();
  const hit = rev.find(
    (e) =>
      e.severity !== "info" ||
      !isLowSignalEventType(e.type) ||
      /fail|error|reject|block|waiting|retry|correct/i.test(e.type),
  );
  return hit ?? rev[0] ?? null;
}

export function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

export function parseIsoDuration(
  startedIso: string | null | undefined,
  endIso: string | null | undefined,
): string | null {
  if (!startedIso) return null;
  const a = Date.parse(startedIso);
  const b = Date.parse(endIso ?? new Date().toISOString());
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return formatDurationShort(b - a);
}
