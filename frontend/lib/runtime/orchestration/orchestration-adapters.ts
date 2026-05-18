import type {
  OrchestrationBootstrapDto,
  OrchestrationExecutionState,
  OrchestrationState,
  RuntimeActiveRunDto,
  RuntimeRecoverySnapshotDto,
  RuntimeRecoveryStatus,
} from "@/lib/runtime/orchestration/orchestration-types";

const EXECUTION_STATES: OrchestrationExecutionState[] = [
  "ready_for_execution",
  "execution_starting",
  "execution_running",
  "execution_reviewing",
  "execution_correcting",
  "execution_blocked",
  "execution_failed",
  "execution_completed",
  "execution_recovering",
];

const ORCH_STATES: OrchestrationState[] = [
  "ready_for_execution",
  "queued",
  "execution_starting",
  "execution_running",
  "execution_reviewing",
  "execution_correcting",
  "execution_blocked",
  "execution_failed",
  "execution_completed",
  "execution_recovering",
  "degraded",
  "unavailable",
];

function asExecutionState(v: unknown): OrchestrationExecutionState {
  const s = String(v || "").trim() as OrchestrationExecutionState;
  return EXECUTION_STATES.includes(s) ? s : "ready_for_execution";
}

function asRecoveryStatus(v: unknown): RuntimeRecoveryStatus {
  const s = String(v || "").trim();
  if (
    s === "recovered" ||
    s === "stale" ||
    s === "orphaned" ||
    s === "recovery_pending" ||
    s === "recovery_failed"
  ) {
    return s;
  }
  return null;
}

function asOrchestrationState(v: unknown): OrchestrationState {
  const s = String(v || "").trim() as OrchestrationState;
  return ORCH_STATES.includes(s) ? s : "ready_for_execution";
}

type ApiExecuteJson = {
  ok?: boolean;
  data?: {
    runId?: string;
    jobId?: string | null;
    executionState?: string;
    orchestrationState?: string;
    startedAt?: string | null;
    workerId?: string | null;
    currentPhase?: string | null;
    idempotent?: boolean;
    recoveryStatus?: string | null;
    recoveryReasons?: string[];
  };
  error?: { code?: string; message?: string };
};

export function mapApiExecuteResponse(
  j: ApiExecuteJson,
  runKey: string,
): OrchestrationBootstrapDto | null {
  if (j.ok === false || !j.data) return null;
  const d = j.data;
  return {
    runId: d.runId != null ? String(d.runId) : runKey,
    jobId: d.jobId != null ? String(d.jobId) : null,
    executionState: asExecutionState(d.executionState),
    orchestrationState: asOrchestrationState(d.orchestrationState),
    startedAt: d.startedAt ?? null,
    workerId: d.workerId ?? null,
    currentPhase: d.currentPhase ?? null,
    idempotent: Boolean(d.idempotent),
    recoveryStatus: asRecoveryStatus(d.recoveryStatus),
    recoveryReasons: Array.isArray(d.recoveryReasons)
      ? d.recoveryReasons.map(String)
      : [],
  };
}

export function mapApiRecoverySnapshot(
  j: { ok?: boolean; data?: Record<string, unknown> },
): RuntimeRecoverySnapshotDto | null {
  if (!j.ok || !j.data) return null;
  const d = j.data;
  const rows = Array.isArray(d.activeRuns) ? d.activeRuns : [];
  const activeRuns: RuntimeActiveRunDto[] = rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      runId: String(r.runId || ""),
      jobId: r.jobId != null ? String(r.jobId) : null,
      orchestrationState: asOrchestrationState(r.orchestrationState),
      executionState: asExecutionState(r.executionState),
      recoveryStatus: asRecoveryStatus(r.recoveryStatus),
      recoveryReasons: Array.isArray(r.recoveryReasons)
        ? r.recoveryReasons.map(String)
        : [],
      jobStatus: r.jobStatus != null ? String(r.jobStatus) : null,
    };
  });
  return {
    activeRuns: activeRuns.filter((x) => x.runId),
    generatedAt:
      typeof d.generatedAt === "string" ? d.generatedAt : new Date().toISOString(),
  };
}

export function parseExecuteErrorCode(json: unknown): string | null {
  if (
    json &&
    typeof json === "object" &&
    "error" in json &&
    typeof (json as { error?: { code?: string } }).error?.code === "string"
  ) {
    return String((json as { error: { code: string } }).error.code);
  }
  return null;
}

export function parseExecuteErrorMessage(json: unknown, fallback: string): string {
  if (
    json &&
    typeof json === "object" &&
    "error" in json &&
    typeof (json as { error?: { message?: string } }).error?.message === "string"
  ) {
    return String((json as { error: { message: string } }).error.message);
  }
  return fallback;
}
