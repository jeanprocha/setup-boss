import type {
  OrchestrationBootstrapDto,
  RuntimeActiveRunDto,
  RuntimeRecoverySnapshotDto,
} from "@/lib/runtime/orchestration/orchestration-types";
import { useOrchestrationStore } from "@/stores/orchestration-store";

/** Restaura bootstrap da corrida seleccionada a partir do snapshot de recovery. */
export function restoreOrchestrationForRun(
  runKey: string,
  snapshot: RuntimeRecoverySnapshotDto | null,
): OrchestrationBootstrapDto | null {
  if (!snapshot) return null;
  const row = snapshot.activeRuns.find((r) => r.runId === runKey);
  if (!row) return null;
  const boot: OrchestrationBootstrapDto = {
    runId: row.runId,
    jobId: row.jobId,
    executionState: row.executionState,
    orchestrationState: row.orchestrationState,
    startedAt: null,
    workerId: null,
    currentPhase: row.executionState,
    recoveryStatus: row.recoveryStatus,
    recoveryReasons: row.recoveryReasons,
  };
  useOrchestrationStore.getState().setLastBootstrap(boot);
  return boot;
}

export function restoreAllActiveOrchestrations(
  snapshot: RuntimeRecoverySnapshotDto,
): RuntimeActiveRunDto[] {
  return snapshot.activeRuns;
}
