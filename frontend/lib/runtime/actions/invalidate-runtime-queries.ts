import type { QueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import type { RuntimeActionId } from "@/lib/runtime/actions/runtime-action-types";

export function invalidateAfterRuntimeAction(
  qc: QueryClient,
  actionId: RuntimeActionId,
  ctx: { projectId: string | null; runKey: string | null },
): void {
  void qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });

  if (actionId === "refresh") return;

  if (ctx.projectId) {
    void qc.invalidateQueries({
      queryKey: runtimeQueryKeys.projectRuns(ctx.projectId),
    });
    void qc.invalidateQueries({
      queryKey: runtimeQueryKeys.events(ctx.projectId, 120),
    });
  }

  if (ctx.runKey) {
    void qc.invalidateQueries({
      queryKey: runtimeQueryKeys.runEvidence(ctx.runKey),
    });
  }
}
