import type { ApiRuntimeEventRow } from "@/lib/api/runtime-types";
import type {
  RuntimeSseConnectedPayload,
  RuntimeSseEventPayload,
  RuntimeSseHeartbeatPayload,
} from "@/lib/runtime/sse/runtime-sse-types";

export const SSE_EVENT_CONNECTED = "connected";
export const SSE_EVENT_HEARTBEAT = "heartbeat";
export const SSE_EVENT_RUNTIME = "runtime_event";

export function parseSseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function parseConnectedPayload(
  raw: string,
): RuntimeSseConnectedPayload | null {
  return parseSseJson<RuntimeSseConnectedPayload>(raw);
}

export function parseHeartbeatPayload(
  raw: string,
): RuntimeSseHeartbeatPayload | null {
  return parseSseJson<RuntimeSseHeartbeatPayload>(raw);
}

export function parseRuntimeEventPayload(
  raw: string,
): ApiRuntimeEventRow | null {
  const j = parseSseJson<RuntimeSseEventPayload>(raw);
  if (!j?.event || typeof j.event !== "object") return null;
  const e = j.event;
  if (typeof e.id !== "string" || typeof e.type !== "string") return null;
  return e;
}

/** Chave de deduplicação: id preferido, senão tipo+timestamp+job. */
export function runtimeEventDedupeKey(row: ApiRuntimeEventRow): string {
  if (row.id) return `id:${row.id}`;
  const ts = row.timestamp || "";
  const job = row.jobId || "";
  return `syn:${row.type}|${ts}|${job}`;
}
