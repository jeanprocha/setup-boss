/** Orchestration / execution trigger — Mission Control MVP. */

export type RuntimeRecoveryStatus =
  | "recovered"
  | "stale"
  | "orphaned"
  | "recovery_pending"
  | "recovery_failed"
  | null;

export type OrchestrationExecutionState =
  | "ready_for_execution"
  | "execution_starting"
  | "execution_running"
  | "execution_reviewing"
  | "execution_correcting"
  | "execution_blocked"
  | "execution_failed"
  | "execution_completed"
  | "execution_recovering";

export type OrchestrationState =
  | "ready_for_execution"
  | "queued"
  | "execution_starting"
  | "execution_running"
  | "execution_reviewing"
  | "execution_correcting"
  | "execution_blocked"
  | "execution_failed"
  | "execution_completed"
  | "execution_recovering"
  | "degraded"
  | "unavailable";

export type OrchestrationBootstrapDto = {
  runId: string;
  jobId: string | null;
  executionState: OrchestrationExecutionState;
  orchestrationState: OrchestrationState;
  startedAt: string | null;
  workerId: string | null;
  currentPhase: string | null;
  idempotent?: boolean;
  recoveryStatus?: RuntimeRecoveryStatus;
  recoveryReasons?: string[];
};

export type RuntimeActiveRunDto = {
  runId: string;
  jobId: string | null;
  orchestrationState: OrchestrationState;
  executionState: OrchestrationExecutionState;
  recoveryStatus: RuntimeRecoveryStatus;
  recoveryReasons: string[];
  jobStatus: string | null;
};

export type RuntimeRecoverySnapshotDto = {
  activeRuns: RuntimeActiveRunDto[];
  generatedAt: string;
};

export type ExecuteRunResult = {
  ok: boolean;
  message: string;
  data: OrchestrationBootstrapDto | null;
};

export type ExecuteGuardReason =
  | "runtime_offline"
  | "clarification_not_approved"
  | "clarification_pending"
  | "clarification_not_ready"
  | "strategy_not_ready"
  | "execution_already_active"
  | "execution_not_applicable"
  | "run_key_missing"
  | "git_branch_required"
  | "git_branch_mismatch"
  | "git_not_repository"
  | "git_branch_unknown"
  | null;

export type ExecuteAvailability = {
  canExecute: boolean;
  reason: ExecuteGuardReason;
  message: string | null;
  degraded: boolean;
};
