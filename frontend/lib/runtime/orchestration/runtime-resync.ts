import type { QueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchRuntimeRecoverySnapshot } from "@/lib/runtime/orchestration/orchestration-recovery-actions";
import { restoreOrchestrationForRun } from "@/lib/runtime/orchestration/orchestration-recovery-sync";

let resyncInFlight: Promise<void> | null = null;
let lastResyncAt = 0;
const RESYNC_MIN_MS = 2000;

/**
 * Resync após reconnect SSE / boot UI — refetch read models sem storm.
 */
export async function resyncRuntimeAfterReconnect(
  qc: QueryClient,
  opts: { projectId: string | null; selectedRunKey: string | null },
): Promise<void> {
  const now = Date.now();
  if (resyncInFlight) return resyncInFlight;
  if (now - lastResyncAt < RESYNC_MIN_MS) return;

  resyncInFlight = (async () => {
    lastResyncAt = Date.now();
    try {
      const snap = await fetchRuntimeRecoverySnapshot();
      if (opts.selectedRunKey && snap) {
        restoreOrchestrationForRun(opts.selectedRunKey, snap);
      }
    } catch {
      /* degraded — polling continua */
    }

    await qc.invalidateQueries({
      queryKey: runtimeQueryKeys.root,
      refetchType: "active",
    });
    if (opts.projectId) {
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.projectRuns(opts.projectId),
      });
    }
    await qc.invalidateQueries({ queryKey: runtimeQueryKeys.heartbeat() });
    await qc.refetchQueries({ queryKey: runtimeQueryKeys.heartbeat() });

    if (opts.selectedRunKey) {
      const runKey = opts.selectedRunKey;
      await Promise.all([
        qc.refetchQueries({
          queryKey: runtimeQueryKeys.execution(runKey),
        }),
        qc.refetchQueries({
          queryKey: runtimeQueryKeys.strategy(runKey),
        }),
        qc.refetchQueries({
          queryKey: runtimeQueryKeys.clarification(runKey),
        }),
        qc.refetchQueries({
          queryKey: runtimeQueryKeys.runObservabilityBundle(runKey),
        }),
        qc.refetchQueries({
          queryKey: runtimeQueryKeys.runEvidence(runKey),
        }),
      ]);
    }
  })().finally(() => {
    resyncInFlight = null;
  });

  return resyncInFlight;
}
