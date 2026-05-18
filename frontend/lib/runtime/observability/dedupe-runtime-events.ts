import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import { runtimeLogDedupeKey } from "@/lib/runtime/observability/normalize-runtime-log-for-ui";

/** Marcos operacionais — 1 linha por tipo+run na vista agregada. */
const OPERATIONAL_MILESTONE_DEDUPE_RE =
  /^(execution_(triggered|started|completed|failed|enqueued|ready|auto)|execution_runtime_(started|completed)|git_branch_(prepared|pushed)|operational_review|operational_finalization)/i;

function eventDedupeKey(ev: RuntimeEventDto): string {
  const type = String(ev.type || ev.message || "")
    .toLowerCase()
    .replace(/^runtime\./, "");
  if (OPERATIONAL_MILESTONE_DEDUPE_RE.test(type)) {
    return `milestone:${type}:${ev.runId ?? ""}`;
  }
  return runtimeLogDedupeKey({
    id: ev.id,
    tsIso: ev.tsIso,
    channel: ev.channel,
    message: ev.type || ev.message,
    runId: ev.runId,
  });
}

/** Dedupe estável para merge SSE + poll + audit (id ou runtimeLogDedupeKey). */
export function dedupeRuntimeEvents(
  events: readonly RuntimeEventDto[],
): RuntimeEventDto[] {
  const byKey = new Map<string, RuntimeEventDto>();
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.tsIso) - Date.parse(b.tsIso),
  );
  for (const ev of sorted) {
    const key = eventDedupeKey(ev);
    byKey.set(key, ev);
  }
  return [...byKey.values()].sort(
    (a, b) => Date.parse(a.tsIso) - Date.parse(b.tsIso),
  );
}
