import type { RunSummaryDto } from "../../api/runtime-types.ts";
import type { ExecutionLifecyclePhase } from "./execution-types.ts";
import type { OrchestrationState } from "../orchestration/orchestration-types.ts";
import { isVersioningOperationallyComplete } from "../operational/versioning-operational-state.ts";

const ACTIVE_ORCH: OrchestrationState[] = [
  "execution_starting",
  "execution_running",
  "execution_reviewing",
  "execution_correcting",
  "execution_recovering",
  "queued",
];

const ACTIVE_LIFECYCLE: ExecutionLifecyclePhase[] = [
  "execution_running",
  "review_running",
  "correction_running",
  "retry_running",
  "recovery_running",
  "rollback_running",
  "execution_blocked",
  "execution_failed",
  "execution_completed",
];

function executionAlreadyStarted(
  lifecyclePhase: ExecutionLifecyclePhase | null | undefined,
  orchestrationState: OrchestrationState | null | undefined,
  jobStatus?: string | null,
): boolean {
  const phase = lifecyclePhase ?? "execution_pending";
  if (phase !== "execution_pending") {
    return ACTIVE_LIFECYCLE.includes(phase);
  }
  const orch = String(orchestrationState ?? "");
  if (ACTIVE_ORCH.includes(orch as OrchestrationState)) return true;
  if (jobStatus === "running" || jobStatus === "pending") return true;
  return false;
}

/** Após versionamento concluído, dispara POST /execute sem terceiro clique. */
export function shouldAutoStartExecutionAfterVersioning(
  summary: RunSummaryDto | null | undefined,
  lifecyclePhase: ExecutionLifecyclePhase | null | undefined,
  orchestrationState: OrchestrationState | null | undefined,
  jobStatus?: string | null,
): boolean {
  if (!summary) return false;
  if (!isVersioningOperationallyComplete(summary)) return false;
  if (executionAlreadyStarted(lifecyclePhase, orchestrationState, jobStatus)) {
    return false;
  }
  return true;
}

/** Auto-start elegível mas bloqueado por guards (ex.: git_branch_mismatch). */
export function isExecutionAutoStartBlocked(
  summary: RunSummaryDto | null | undefined,
  lifecyclePhase: ExecutionLifecyclePhase | null | undefined,
  orchestrationState: OrchestrationState | null | undefined,
  opts?: { canExecute?: boolean; jobStatus?: string | null },
): boolean {
  if (opts?.canExecute !== false) return false;
  return shouldAutoStartExecutionAfterVersioning(
    summary,
    lifecyclePhase,
    orchestrationState,
    opts?.jobStatus,
  );
}

/** Arranque automático em curso (UI — sem CTA manual). Só com canExecute. */
export function executionAutoStartInProgress(
  summary: RunSummaryDto | null | undefined,
  lifecyclePhase: ExecutionLifecyclePhase | null | undefined,
  orchestrationState: OrchestrationState | null | undefined,
  opts?: {
    executePending?: boolean;
    jobStatus?: string | null;
    autoStartFailed?: boolean;
    canExecute?: boolean;
  },
): boolean {
  if (opts?.autoStartFailed) return false;
  if (opts?.canExecute === false) return false;
  if (!shouldAutoStartExecutionAfterVersioning(
    summary,
    lifecyclePhase,
    orchestrationState,
    opts?.jobStatus,
  )) {
    return false;
  }
  if (opts?.executePending) return true;
  const phase = lifecyclePhase ?? "execution_pending";
  if (phase === "execution_pending") {
    const orch = String(orchestrationState ?? "");
    return (
      (orch === "ready_for_execution" || orch === "") &&
      opts?.canExecute !== false
    );
  }
  return false;
}
