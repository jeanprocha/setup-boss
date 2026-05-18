import type {
  CorrectionLoopDto,
  ExecutionBlockerDto,
  ExecutionBundleDto,
  ExecutionLifecyclePhase,
  ExecutionSubtaskDto,
  MaterializedExecutionDto,
  MaterializedMiniActivityDto,
  MaterializedMiniActivityStatus,
  MiniActivityOperationalEventDto,
  MiniActivityOperationalEventType,
  MiniActivityTransitionDto,
  RecoveryStateDto,
  RetryStateDto,
  ReviewStateDto,
  SubtaskExecutionState,
} from "@/lib/runtime/execution/execution-types";
import { normalizeExecutionLifecyclePhase } from "@/lib/runtime/execution/execution-state";

type ApiJson = {
  ok?: boolean;
  data?: {
    summary?: Record<string, unknown>;
    subtasks?: Record<string, unknown>[];
    materializedExecution?: Record<string, unknown> | null;
    source?: string;
    unsupportedReason?: string | null;
  };
};

const OPERATIONAL_EVENT_TYPES: MiniActivityOperationalEventType[] = [
  "review_started",
  "review_approved",
  "review_rejected",
  "review_blocked",
  "correction_started",
  "correction_completed",
  "correction_failed",
  "review_retried",
];

function mapOperationalHistory(
  raw: unknown,
): MiniActivityOperationalEventDto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const e = item as Record<string, unknown>;
      const type = str(e.type) as MiniActivityOperationalEventType;
      if (!OPERATIONAL_EVENT_TYPES.includes(type)) return null;
      const at = str(e.at);
      if (!at) return null;
      return {
        type,
        at,
        reason: e.reason != null ? str(e.reason) : null,
      } satisfies MiniActivityOperationalEventDto;
    })
    .filter((x): x is MiniActivityOperationalEventDto => x != null);
}

function mapTransitionHistory(raw: unknown): MiniActivityTransitionDto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const t = item as Record<string, unknown>;
      const at = str(t.at);
      if (!at) return null;
      return {
        at,
        from: str(t.from),
        to: str(t.to),
        reason: t.reason != null ? str(t.reason) : null,
      } satisfies MiniActivityTransitionDto;
    })
    .filter((x): x is MiniActivityTransitionDto => x != null);
}

const MINI_ACTIVITY_STATUSES: MaterializedMiniActivityStatus[] = [
  "pending",
  "ready",
  "blocked_by_dependency",
  "running",
  "review",
  "completed",
  "failed",
  "skipped",
];

function mapMiniActivityStatus(raw: unknown): MaterializedMiniActivityStatus {
  const s = str(raw) as MaterializedMiniActivityStatus;
  return MINI_ACTIVITY_STATUSES.includes(s) ? s : "pending";
}

function mapMaterializedExecution(
  raw: Record<string, unknown> | null | undefined,
): MaterializedExecutionDto | null {
  if (!raw) return null;
  const trace =
    raw.traceability && typeof raw.traceability === "object"
      ? (raw.traceability as Record<string, unknown>)
      : {};
  const miniActivities = Array.isArray(raw.miniActivities)
    ? raw.miniActivities
        .map((item, idx) => {
          if (!item || typeof item !== "object") return null;
          const m = item as Record<string, unknown>;
          const progress =
            m.progress && typeof m.progress === "object"
              ? (m.progress as Record<string, unknown>)
              : {};
          return {
            miniActivityId: str(m.miniActivityId) || `ma-${idx + 1}`,
            miniTaskId: str(m.miniTaskId) || str(m.miniActivityId),
            subtaskId: m.subtaskId != null ? str(m.subtaskId) : null,
            order: typeof m.order === "number" ? m.order : idx + 1,
            title: str(m.title) || `Mini-tarefa ${idx + 1}`,
            objective: m.objective != null ? str(m.objective) : null,
            scopeSummary: m.scopeSummary != null ? str(m.scopeSummary) : null,
            dependsOnMiniActivityIds: Array.isArray(m.dependsOnMiniActivityIds)
              ? m.dependsOnMiniActivityIds.map((x) => str(x)).filter(Boolean)
              : [],
            completionCriteria: Array.isArray(m.completionCriteria)
              ? m.completionCriteria.map((x) => str(x)).filter(Boolean)
              : [],
            status: mapMiniActivityStatus(m.status),
            reviewState: str(m.reviewState) || "none",
            reviewStatus: m.reviewStatus != null ? str(m.reviewStatus) : null,
            reviewSummary:
              m.reviewSummary != null ? str(m.reviewSummary) : null,
            reviewArtifactRef:
              m.reviewArtifactRef != null ? str(m.reviewArtifactRef) : null,
            correctionRequired: m.correctionRequired === true,
            correctionRef: m.correctionRef != null ? str(m.correctionRef) : null,
            correctionPhase:
              m.correctionPhase === "correction_required" ||
              m.correctionPhase === "correction_running"
                ? m.correctionPhase
                : "none",
            reviewedAt: m.reviewedAt != null ? str(m.reviewedAt) : null,
            progress: {
              percent:
                typeof progress.percent === "number" ? progress.percent : 0,
              step: progress.step != null ? str(progress.step) : null,
            },
            linkedSubtaskExecutionRel:
              m.linkedSubtaskExecutionRel != null
                ? str(m.linkedSubtaskExecutionRel)
                : null,
            operationalHistory: mapOperationalHistory(m.operationalHistory),
            transitionHistory: mapTransitionHistory(m.transitionHistory),
          } satisfies MaterializedMiniActivityDto;
        })
        .filter((x): x is MaterializedMiniActivityDto => x != null)
    : [];

  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    runId: str(raw.runId),
    materializedAt:
      raw.materializedAt != null ? str(raw.materializedAt) : null,
    updatedAt: raw.updatedAt != null ? str(raw.updatedAt) : null,
    legacy: Boolean(raw.legacy),
    orderingMode: str(raw.orderingMode) || "linear",
    aggregatedStatus: str(raw.aggregatedStatus) || "pending",
    currentMiniActivityId:
      raw.currentMiniActivityId != null
        ? str(raw.currentMiniActivityId)
        : null,
    traceability: {
      strategySha256:
        trace.strategySha256 != null ? str(trace.strategySha256) : null,
      planVersion: trace.planVersion != null ? str(trace.planVersion) : null,
      sourcePlanVersion:
        trace.sourcePlanVersion != null
          ? str(trace.sourcePlanVersion)
          : null,
      sourcePlanSha256:
        trace.sourcePlanSha256 != null ? str(trace.sourcePlanSha256) : null,
      sourcePlanRef:
        trace.sourcePlanRef != null ? str(trace.sourcePlanRef) : null,
      sourceCommentId:
        trace.sourceCommentId != null ? str(trace.sourceCommentId) : null,
      sourcePlanId:
        trace.sourcePlanId != null ? str(trace.sourcePlanId) : null,
      oesVersion: typeof trace.oesVersion === "number" ? trace.oesVersion : 1,
    },
    miniActivities,
  };
}

function str(v: unknown): string {
  return v != null ? String(v) : "";
}

function mapReview(raw: Record<string, unknown> | undefined): ReviewStateDto {
  const status = raw?.status;
  const s =
    status === "pending" ||
    status === "approved" ||
    status === "rejected"
      ? status
      : "none";
  return {
    status: s,
    rejectionReason:
      raw?.rejectionReason != null ? str(raw.rejectionReason) : null,
    reviewerHint: raw?.reviewerHint != null ? str(raw.reviewerHint) : null,
    decidedAt: raw?.decidedAt != null ? str(raw.decidedAt) : null,
  };
}

function mapCorrection(raw: Record<string, unknown> | undefined): CorrectionLoopDto {
  const status = raw?.status;
  const st =
    status === "active" ||
    status === "awaiting_review" ||
    status === "closed"
      ? status
      : "idle";
  return {
    generation: typeof raw?.generation === "number" ? raw.generation : 0,
    status: st,
    summary: raw?.summary != null ? str(raw.summary) : null,
    rejectionReason:
      raw?.rejectionReason != null ? str(raw.rejectionReason) : null,
    approvedAfterCorrection: Boolean(raw?.approvedAfterCorrection),
  };
}

function mapRetry(raw: Record<string, unknown> | undefined): RetryStateDto {
  return {
    active: Boolean(raw?.active),
    count: typeof raw?.count === "number" ? raw.count : 0,
    maxAttempts: typeof raw?.maxAttempts === "number" ? raw.maxAttempts : 3,
    reason: raw?.reason != null ? str(raw.reason) : null,
    lastAttemptAt:
      raw?.lastAttemptAt != null ? str(raw.lastAttemptAt) : null,
  };
}

function mapRecovery(raw: Record<string, unknown> | undefined): RecoveryStateDto {
  const status = raw?.status;
  const st =
    status === "in_progress" ||
    status === "completed" ||
    status === "degraded"
      ? status
      : "none";
  return {
    status: st,
    summary: raw?.summary != null ? str(raw.summary) : null,
    recoveredSubtasks:
      typeof raw?.recoveredSubtasks === "number" ? raw.recoveredSubtasks : 0,
    problematicSubtasks:
      typeof raw?.problematicSubtasks === "number"
        ? raw.problematicSubtasks
        : 0,
  };
}

export function mapBlockers(raw: unknown): ExecutionBlockerDto[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    if (typeof item === "string") {
      return {
        id: `blk-${idx + 1}`,
        label: item,
        severity: "medium",
        source: null,
      };
    }
    const r = item as Record<string, unknown>;
    const sev = r.severity;
    const severity =
      sev === "low" || sev === "high" || sev === "medium" ? sev : "medium";
    const src = r.source;
    const source =
      src === "subtask" ||
      src === "policy" ||
      src === "runtime" ||
      src === "review"
        ? src
        : null;
    return {
      id: str(r.id) || `blk-${idx + 1}`,
      label: str(r.label) || `blocker-${idx + 1}`,
      severity,
      source,
    };
  });
}

function mapSubtaskState(raw: unknown): SubtaskExecutionState {
  const s = str(raw).toLowerCase();
  const allowed: SubtaskExecutionState[] = [
    "pending",
    "queued",
    "running",
    "reviewing",
    "correcting",
    "retrying",
    "blocked",
    "failed",
    "recovered",
    "completed",
  ];
  return (allowed.includes(s as SubtaskExecutionState)
    ? s
    : "pending") as SubtaskExecutionState;
}

function mapSubtask(raw: Record<string, unknown>, idx: number): ExecutionSubtaskDto {
  const review = mapReview(
    (raw.review as Record<string, unknown> | undefined) ?? undefined,
  );
  const corrRaw = raw.correction as Record<string, unknown> | undefined;
  const readiness = raw.readiness;
  return {
    id: str(raw.id) || `st-${idx + 1}`,
    title: str(raw.title) || str(raw.id),
    order: typeof raw.order === "number" ? raw.order : idx + 1,
    state: mapSubtaskState(raw.state),
    durationMs: typeof raw.durationMs === "number" ? raw.durationMs : null,
    retryCount: typeof raw.retryCount === "number" ? raw.retryCount : 0,
    review,
    correction: {
      generation:
        typeof corrRaw?.generation === "number" ? corrRaw.generation : 0,
      status:
        corrRaw?.status === "active" ||
        corrRaw?.status === "awaiting_review" ||
        corrRaw?.status === "closed"
          ? corrRaw.status
          : "idle",
    },
    readiness:
      readiness === "ready" || readiness === "blocked"
        ? readiness
        : "not_ready",
    blockerLabel: raw.blockerLabel != null ? str(raw.blockerLabel) : null,
  };
}

export function mapApiExecutionBundle(
  json: ApiJson,
  runId: string,
): ExecutionBundleDto | null {
  if (!json.ok || !json.data) return null;
  const d = json.data;
  const summaryRaw = d.summary ?? {};
  const lifecycleRaw = (summaryRaw.lifecycle as Record<string, unknown>) ?? {};
  const progressRaw = (summaryRaw.progress as Record<string, unknown>) ?? {};

  const phase = normalizeExecutionLifecyclePhase(
    str(lifecycleRaw.phase) || str(summaryRaw.lifecyclePhase),
  );

  const subtasks = Array.isArray(d.subtasks)
    ? d.subtasks.map((st, i) =>
        mapSubtask(st as Record<string, unknown>, i),
      )
    : [];

  const total =
    typeof progressRaw.total === "number"
      ? progressRaw.total
      : subtasks.length;

  const source =
    d.source === "runtime" || d.source === "mock" || d.source === "unsupported"
      ? d.source
      : "runtime";

  return {
    summary: {
      runId: str(summaryRaw.runId) || runId,
      label: str(summaryRaw.label) || runId,
      lifecycle: {
        phase,
        currentSubtaskId:
          lifecycleRaw.currentSubtaskId != null
            ? str(lifecycleRaw.currentSubtaskId)
            : null,
        startedAt:
          lifecycleRaw.startedAt != null ? str(lifecycleRaw.startedAt) : null,
        updatedAt:
          lifecycleRaw.updatedAt != null ? str(lifecycleRaw.updatedAt) : null,
      },
      progress: {
        completed:
          typeof progressRaw.completed === "number" ? progressRaw.completed : 0,
        active: typeof progressRaw.active === "number" ? progressRaw.active : 0,
        blocked:
          typeof progressRaw.blocked === "number" ? progressRaw.blocked : 0,
        failed: typeof progressRaw.failed === "number" ? progressRaw.failed : 0,
        pending:
          typeof progressRaw.pending === "number" ? progressRaw.pending : 0,
        total,
      },
      review: mapReview(summaryRaw.review as Record<string, unknown>),
      correction: mapCorrection(summaryRaw.correction as Record<string, unknown>),
      retry: mapRetry(summaryRaw.retry as Record<string, unknown>),
      recovery: mapRecovery(summaryRaw.recovery as Record<string, unknown>),
      blockers: mapBlockers(summaryRaw.blockers),
      health:
        summaryRaw.health === "healthy" ||
        summaryRaw.health === "degraded" ||
        summaryRaw.health === "partial" ||
        summaryRaw.health === "unavailable"
          ? summaryRaw.health
          : "partial",
      source,
      unsupportedReason:
        d.unsupportedReason != null ? str(d.unsupportedReason) : null,
    },
    subtasks,
    materializedExecution: mapMaterializedExecution(
      d.materializedExecution as Record<string, unknown> | null | undefined,
    ),
  };
}

export function buildUnsupportedExecutionBundle(
  runId: string,
  reason: string,
): ExecutionBundleDto {
  return {
    summary: {
      runId,
      label: runId,
      lifecycle: {
        phase: "execution_pending",
        currentSubtaskId: null,
        startedAt: null,
        updatedAt: null,
      },
      progress: {
        completed: 0,
        active: 0,
        blocked: 0,
        failed: 0,
        pending: 0,
        total: 0,
      },
      review: {
        status: "none",
        rejectionReason: null,
        reviewerHint: null,
        decidedAt: null,
      },
      correction: {
        generation: 0,
        status: "idle",
        summary: null,
        rejectionReason: null,
        approvedAfterCorrection: false,
      },
      retry: {
        active: false,
        count: 0,
        maxAttempts: 3,
        reason: null,
        lastAttemptAt: null,
      },
      recovery: {
        status: "none",
        summary: null,
        recoveredSubtasks: 0,
        problematicSubtasks: 0,
      },
      blockers: [],
      health: "unavailable",
      source: "unsupported",
      unsupportedReason: reason,
    },
    subtasks: [],
    materializedExecution: null,
  };
}

export function reconcileLifecyclePhase(
  bundle: ExecutionBundleDto,
  inferred: ExecutionLifecyclePhase,
): ExecutionBundleDto {
  if (bundle.summary.lifecycle.phase === "execution_pending") {
    return {
      ...bundle,
      summary: {
        ...bundle.summary,
        lifecycle: { ...bundle.summary.lifecycle, phase: inferred },
      },
    };
  }
  return bundle;
}
