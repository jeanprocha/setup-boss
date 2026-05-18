import type {
  ExecutionBlockerDto,
  ExecutionBundleDto,
} from "@/lib/runtime/execution/execution-types";

function blockers(
  items: { label: string; severity?: ExecutionBlockerDto["severity"]; source?: ExecutionBlockerDto["source"] }[],
): ExecutionBlockerDto[] {
  return items.map((item, idx) => ({
    id: `blk-${idx + 1}`,
    label: item.label,
    severity: item.severity ?? "medium",
    source: item.source ?? null,
  }));
}
import { deriveLifecycleFromRunMeta } from "@/lib/runtime/execution/execution-state";
import { computeProgressFromSubtasks } from "@/lib/runtime/execution/execution-selectors";
import { mockRuns } from "@/lib/mocks/runs";

function bundleFor(
  runId: string,
  patch: Partial<ExecutionBundleDto> & {
    subtasks: ExecutionBundleDto["subtasks"];
    summaryPatch?: Partial<ExecutionBundleDto["summary"]>;
  },
): ExecutionBundleDto {
  const run = mockRuns.find((r) => r.id === runId);
  const phase = deriveLifecycleFromRunMeta(
    run?.phase,
    run?.state,
    null,
  );
  const subtasks = patch.subtasks;
  const progress = computeProgressFromSubtasks(subtasks);
  const { lifecycle: lifecyclePatch, progress: progressPatch, ...restPatch } =
    patch.summaryPatch ?? {};

  return {
    subtasks,
    summary: {
      runId,
      label: run?.label ?? runId,
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
      health: "healthy",
      source: "mock",
      unsupportedReason: null,
      ...restPatch,
      progress: progressPatch ?? progress,
      lifecycle: {
        phase: lifecyclePatch?.phase ?? phase,
        currentSubtaskId:
          lifecyclePatch?.currentSubtaskId ??
          subtasks.find((s) =>
            ["running", "reviewing", "correcting", "retrying"].includes(
              s.state,
            ),
          )?.id ??
          null,
        startedAt: lifecyclePatch?.startedAt ?? "2026-05-15T10:00:00.000Z",
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

const BY_RUN: Record<string, ExecutionBundleDto> = {
  "run-1024": bundleFor("run-1024", {
    summaryPatch: {
      lifecycle: { phase: "execution_running" } as ExecutionBundleDto["summary"]["lifecycle"],
      health: "healthy",
    },
    subtasks: [
      {
        id: "st-build",
        title: "build-execution-session",
        order: 1,
        state: "completed",
        durationMs: 4200,
        retryCount: 0,
        review: { status: "approved", rejectionReason: null, reviewerHint: null, decidedAt: null },
        correction: { generation: 0, status: "idle" },
        readiness: "ready",
        blockerLabel: null,
      },
      {
        id: "st-exec",
        title: "subtask-executor",
        order: 2,
        state: "running",
        durationMs: 185_000,
        retryCount: 0,
        review: { status: "none", rejectionReason: null, reviewerHint: null, decidedAt: null },
        correction: { generation: 0, status: "idle" },
        readiness: "ready",
        blockerLabel: null,
      },
      {
        id: "st-review",
        title: "run-execution-review",
        order: 3,
        state: "queued",
        durationMs: null,
        retryCount: 0,
        review: { status: "none", rejectionReason: null, reviewerHint: null, decidedAt: null },
        correction: { generation: 0, status: "idle" },
        readiness: "not_ready",
        blockerLabel: null,
      },
    ],
  }),
  "run-1022": bundleFor("run-1022", {
    summaryPatch: {
      lifecycle: { phase: "review_running" } as ExecutionBundleDto["summary"]["lifecycle"],
      review: {
        status: "pending",
        rejectionReason: null,
        reviewerHint: "Verificar diff e critérios de aceite",
        decidedAt: null,
      },
      blockers: blockers([
        {
          label: "Aguarda veredito humano no gate de review",
          severity: "high",
          source: "review",
        },
      ]),
      health: "degraded",
    },
    subtasks: [
      {
        id: "st-det",
        title: "deterministic-review",
        order: 1,
        state: "failed",
        durationMs: 12_400,
        retryCount: 0,
        review: {
          status: "rejected",
          rejectionReason: "Patch excede limite de LOC sem justificação",
          reviewerHint: null,
          decidedAt: "2026-05-15T11:00:00.000Z",
        },
        correction: { generation: 0, status: "idle" },
        readiness: "blocked",
        blockerLabel: "Política de patch",
      },
      {
        id: "st-hitl",
        title: "hitl-approval",
        order: 2,
        state: "reviewing",
        durationMs: null,
        retryCount: 0,
        review: {
          status: "pending",
          rejectionReason: null,
          reviewerHint: "Operador deve aprovar ou pedir correcção",
          decidedAt: null,
        },
        correction: { generation: 0, status: "idle" },
        readiness: "blocked",
        blockerLabel: "HITL pendente",
      },
    ],
  }),
  "run-1021": bundleFor("run-1021", {
    summaryPatch: {
      lifecycle: { phase: "correction_running" } as ExecutionBundleDto["summary"]["lifecycle"],
      correction: {
        generation: 2,
        status: "active",
        summary: "Ajustar manifest e re-aplicar subtask executor",
        rejectionReason: "Semântica divergente no artefacto strategy",
        approvedAfterCorrection: false,
      },
      review: {
        status: "rejected",
        rejectionReason: "Critério de integridade não satisfeito",
        reviewerHint: null,
        decidedAt: "2026-05-15T09:30:00.000Z",
      },
      blockers: blockers([
        {
          label: "Correcção activa — review bloqueado até nova geração",
          severity: "high",
          source: "runtime",
        },
      ]),
      health: "degraded",
    },
    subtasks: [
      {
        id: "st-apply",
        title: "executor-apply",
        order: 1,
        state: "correcting",
        durationMs: 95_000,
        retryCount: 1,
        review: {
          status: "rejected",
          rejectionReason: "Diff inconsistente com plano",
          reviewerHint: null,
          decidedAt: null,
        },
        correction: { generation: 2, status: "active" },
        readiness: "not_ready",
        blockerLabel: "Loop de correcção",
      },
      {
        id: "st-close",
        title: "integrity-close",
        order: 2,
        state: "pending",
        durationMs: null,
        retryCount: 0,
        review: { status: "none", rejectionReason: null, reviewerHint: null, decidedAt: null },
        correction: { generation: 0, status: "idle" },
        readiness: "not_ready",
        blockerLabel: null,
      },
    ],
  }),
  "run-1020": bundleFor("run-1020", {
    summaryPatch: {
      lifecycle: { phase: "retry_running" } as ExecutionBundleDto["summary"]["lifecycle"],
      retry: {
        active: true,
        count: 2,
        maxAttempts: 3,
        reason: "Timeout no worker ao aplicar patch",
        lastAttemptAt: "2026-05-15T10:22:19.000Z",
      },
      blockers: blockers([
        { label: "Retry 2/3 — aguardar resultado", severity: "medium", source: "runtime" },
      ]),
      health: "degraded",
    },
    subtasks: [
      {
        id: "st-retry",
        title: "subtask-executor-retry",
        order: 1,
        state: "retrying",
        durationMs: 45_000,
        retryCount: 2,
        review: { status: "none", rejectionReason: null, reviewerHint: null, decidedAt: null },
        correction: { generation: 0, status: "idle" },
        readiness: "ready",
        blockerLabel: null,
      },
    ],
  }),
  "run-1019": bundleFor("run-1019", {
    summaryPatch: {
      lifecycle: { phase: "recovery_running" } as ExecutionBundleDto["summary"]["lifecycle"],
      recovery: {
        status: "completed",
        summary: "Subtasks recuperadas após falha transitória do worker",
        recoveredSubtasks: 3,
        problematicSubtasks: 1,
      },
      health: "degraded",
    },
    subtasks: [
      {
        id: "st-a",
        title: "stabilize-artifacts",
        order: 1,
        state: "recovered",
        durationMs: 8000,
        retryCount: 1,
        review: { status: "approved", rejectionReason: null, reviewerHint: null, decidedAt: null },
        correction: { generation: 0, status: "closed" },
        readiness: "ready",
        blockerLabel: null,
      },
      {
        id: "st-b",
        title: "integrity-report",
        order: 2,
        state: "running",
        durationMs: 22_000,
        retryCount: 0,
        review: { status: "none", rejectionReason: null, reviewerHint: null, decidedAt: null },
        correction: { generation: 0, status: "idle" },
        readiness: "ready",
        blockerLabel: null,
      },
    ],
  }),
  "run-completed": bundleFor("run-completed", {
    summaryPatch: {
      lifecycle: { phase: "execution_completed" } as ExecutionBundleDto["summary"]["lifecycle"],
      health: "healthy",
    },
    subtasks: [
      {
        id: "st-done-1",
        title: "build-execution-session",
        order: 1,
        state: "completed",
        durationMs: 5100,
        retryCount: 0,
        review: { status: "approved", rejectionReason: null, reviewerHint: null, decidedAt: null },
        correction: { generation: 0, status: "closed" },
        readiness: "ready",
        blockerLabel: null,
      },
      {
        id: "st-done-2",
        title: "integrity-close",
        order: 2,
        state: "completed",
        durationMs: 2800,
        retryCount: 0,
        review: { status: "approved", rejectionReason: null, reviewerHint: null, decidedAt: null },
        correction: { generation: 0, status: "closed" },
        readiness: "ready",
        blockerLabel: null,
      },
    ],
  }),
  "run-1018": bundleFor("run-1018", {
    summaryPatch: {
      lifecycle: { phase: "execution_blocked" } as ExecutionBundleDto["summary"]["lifecycle"],
      blockers: blockers([
        { label: "Governança semântica", severity: "high", source: "policy" },
        { label: "Dependência de fase anterior", severity: "medium", source: "runtime" },
      ]),
      health: "partial",
    },
    subtasks: [
      {
        id: "st-gov",
        title: "policy-gate",
        order: 1,
        state: "blocked",
        durationMs: null,
        retryCount: 0,
        review: { status: "none", rejectionReason: null, reviewerHint: null, decidedAt: null },
        correction: { generation: 0, status: "idle" },
        readiness: "blocked",
        blockerLabel: "Política",
      },
    ],
  }),
};

const DEFAULT_SUBTASKS: ExecutionBundleDto["subtasks"] = [
  {
    id: "st-1",
    title: "intake-discovery",
    order: 1,
    state: "completed",
    durationMs: 3100,
    retryCount: 0,
    review: { status: "approved", rejectionReason: null, reviewerHint: null, decidedAt: null },
    correction: { generation: 0, status: "idle" },
    readiness: "ready",
    blockerLabel: null,
  },
  {
    id: "st-4",
    title: "executor-apply",
    order: 4,
    state: "running",
    durationMs: 120_000,
    retryCount: 0,
    review: { status: "none", rejectionReason: null, reviewerHint: null, decidedAt: null },
    correction: { generation: 0, status: "idle" },
    readiness: "ready",
    blockerLabel: null,
  },
  {
    id: "st-5",
    title: "review-gate",
    order: 5,
    state: "queued",
    durationMs: null,
    retryCount: 0,
    review: { status: "none", rejectionReason: null, reviewerHint: null, decidedAt: null },
    correction: { generation: 0, status: "idle" },
    readiness: "not_ready",
    blockerLabel: null,
  },
];

export function getMockExecutionBundle(runId: string): ExecutionBundleDto {
  if (BY_RUN[runId]) return BY_RUN[runId];
  return bundleFor(runId, { subtasks: DEFAULT_SUBTASKS });
}

export function mockExecutionUnsupported(runId: string): ExecutionBundleDto {
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
      unsupportedReason:
        "Sem read-model de execução para esta corrida (API ou mock).",
    },
    subtasks: [],
  };
}
