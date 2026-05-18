import type { QueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import type { WorkspaceRunSsePayload } from "@/lib/workspace/sse/workspace-run-sse-types";

/**
 * Invalida read models de WorkspaceRun após evento SSE (throttle leve por run).
 */
const lastInvalidateByRun = new Map<string, number>();
const THROTTLE_MS = 400;

export function invalidateWorkspaceRunQueries(
  qc: QueryClient,
  payload: WorkspaceRunSsePayload,
) {
  const runId = payload.workspaceRunId;
  const wsId = payload.workspaceId || null;
  const now = Date.now();
  const prev = lastInvalidateByRun.get(runId) ?? 0;
  if (now - prev < THROTTLE_MS) return;
  lastInvalidateByRun.set(runId, now);

  void qc.invalidateQueries({
    queryKey: runtimeQueryKeys.workspaceRunDetail(runId),
  });
  void qc.invalidateQueries({
    queryKey: runtimeQueryKeys.workspaceRunGit(runId),
  });
  if (wsId) {
    void qc.invalidateQueries({
      queryKey: runtimeQueryKeys.workspaceRuns(wsId),
    });
  }
  if (payload.eventType === "workspace_run.error") {
    void qc.invalidateQueries({ queryKey: runtimeQueryKeys.status() });
  }
}
