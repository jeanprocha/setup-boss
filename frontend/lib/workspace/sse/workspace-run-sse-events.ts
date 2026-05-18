import {
  WORKSPACE_RUN_SSE_EVENT_TYPES,
  type WorkspaceRunSseEventType,
  type WorkspaceRunSsePayload,
} from "@/lib/workspace/sse/workspace-run-sse-types";

function parseSseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function parseWorkspaceRunSsePayload(
  raw: string,
  eventType: string,
): WorkspaceRunSsePayload | null {
  if (
    !WORKSPACE_RUN_SSE_EVENT_TYPES.includes(
      eventType as WorkspaceRunSseEventType,
    )
  ) {
    return null;
  }
  const j = parseSseJson<WorkspaceRunSsePayload>(raw);
  if (!j || typeof j.workspaceRunId !== "string") return null;
  return {
    ...j,
    eventType: eventType as WorkspaceRunSseEventType,
  };
}
