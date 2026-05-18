/** DTOs mínimos — Execution Runtime (read-only, operacional). */

export type ExecutionLifecyclePhase =
  | "execution_pending"
  | "execution_running"
  | "review_running"
  | "correction_running"
  | "retry_running"
  | "rollback_running"
  | "recovery_running"
  | "execution_blocked"
  | "execution_failed"
  | "execution_completed";

export type SubtaskExecutionState =
  | "pending"
  | "queued"
  | "running"
  | "reviewing"
  | "correcting"
  | "retrying"
  | "blocked"
  | "failed"
  | "recovered"
  | "completed";

export type ReviewStateDto = {
  status: "none" | "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  reviewerHint: string | null;
  decidedAt: string | null;
};

export type CorrectionLoopDto = {
  generation: number;
  status: "idle" | "active" | "awaiting_review" | "closed";
  summary: string | null;
  rejectionReason: string | null;
  approvedAfterCorrection: boolean;
};

export type RetryStateDto = {
  active: boolean;
  count: number;
  maxAttempts: number;
  reason: string | null;
  lastAttemptAt: string | null;
};

export type RecoveryStateDto = {
  status: "none" | "in_progress" | "completed" | "degraded";
  summary: string | null;
  recoveredSubtasks: number;
  problematicSubtasks: number;
};

export type ExecutionBlockerDto = {
  id: string;
  label: string;
  severity: "low" | "medium" | "high";
  source: "subtask" | "policy" | "runtime" | "review" | null;
};

export type ExecutionSubtaskDto = {
  id: string;
  title: string;
  order: number;
  state: SubtaskExecutionState;
  durationMs: number | null;
  retryCount: number;
  review: ReviewStateDto;
  correction: Pick<CorrectionLoopDto, "generation" | "status">;
  readiness: "not_ready" | "ready" | "blocked";
  blockerLabel: string | null;
};

export type ExecutionLifecycleDto = {
  phase: ExecutionLifecyclePhase;
  currentSubtaskId: string | null;
  startedAt: string | null;
  updatedAt: string | null;
};

export type ExecutionSummaryDto = {
  runId: string;
  label: string;
  lifecycle: ExecutionLifecycleDto;
  progress: ExecutionProgressDto;
  review: ReviewStateDto;
  correction: CorrectionLoopDto;
  retry: RetryStateDto;
  recovery: RecoveryStateDto;
  blockers: ExecutionBlockerDto[];
  health: "healthy" | "degraded" | "partial" | "unavailable";
  /** runtime | mock | unsupported */
  source: "runtime" | "mock" | "unsupported";
  unsupportedReason: string | null;
};

export type ExecutionProgressDto = {
  completed: number;
  active: number;
  blocked: number;
  failed: number;
  pending: number;
  total: number;
};

export type MaterializedMiniActivityStatus =
  | "pending"
  | "ready"
  | "blocked_by_dependency"
  | "running"
  | "review"
  | "completed"
  | "failed"
  | "skipped";

export type MiniActivityOperationalEventType =
  | "review_started"
  | "review_approved"
  | "review_rejected"
  | "review_blocked"
  | "correction_started"
  | "correction_completed"
  | "correction_failed"
  | "review_retried";

export type MiniActivityOperationalEventDto = {
  type: MiniActivityOperationalEventType;
  at: string;
  reason: string | null;
};

export type MiniActivityTransitionDto = {
  at: string;
  from: string;
  to: string;
  reason: string | null;
};

export type MaterializedMiniActivityDto = {
  miniActivityId: string;
  miniTaskId: string;
  subtaskId: string | null;
  order: number;
  title: string;
  objective: string | null;
  scopeSummary: string | null;
  dependsOnMiniActivityIds: string[];
  completionCriteria: string[];
  status: MaterializedMiniActivityStatus;
  reviewState: string;
  reviewStatus: string | null;
  reviewSummary: string | null;
  reviewArtifactRef: string | null;
  correctionRequired: boolean;
  correctionRef: string | null;
  correctionPhase: "none" | "correction_required" | "correction_running";
  reviewedAt: string | null;
  progress: { percent: number; step: string | null };
  linkedSubtaskExecutionRel: string | null;
  operationalHistory: MiniActivityOperationalEventDto[];
  transitionHistory: MiniActivityTransitionDto[];
};

export type MaterializedExecutionTraceabilityDto = {
  strategySha256: string | null;
  planVersion: string | null;
  sourcePlanVersion: string | null;
  sourcePlanSha256: string | null;
  sourcePlanRef: string | null;
  sourceCommentId: string | null;
  sourcePlanId: string | null;
  oesVersion: number;
};

export type MaterializedExecutionDto = {
  version: number;
  runId: string;
  materializedAt: string | null;
  updatedAt: string | null;
  legacy: boolean;
  orderingMode: string;
  aggregatedStatus: string;
  currentMiniActivityId: string | null;
  traceability: MaterializedExecutionTraceabilityDto;
  miniActivities: MaterializedMiniActivityDto[];
};

export type ExecutionBundleDto = {
  summary: ExecutionSummaryDto;
  subtasks: ExecutionSubtaskDto[];
  materializedExecution?: MaterializedExecutionDto | null;
};

export type ExecutionCorrelationTarget =
  | "timeline"
  | "stream"
  | "diagnostics"
  | "artifacts"
  | "integrity"
  | "strategy";

export type ExecutionCorrelationLink = {
  target: ExecutionCorrelationTarget;
  label: string;
  available: boolean;
  hint: string | null;
};
