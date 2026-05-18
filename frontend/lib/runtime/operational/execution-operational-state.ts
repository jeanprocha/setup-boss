import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { RunSummaryDto } from "../../api/runtime-types.ts";
import type {
  ExecutionLifecyclePhase,
  ExecutionSubtaskDto,
  MaterializedMiniActivityDto,
  MaterializedMiniActivityStatus,
  SubtaskExecutionState,
} from "../execution/execution-types.ts";
import type { OrchestrationState } from "../orchestration/orchestration-types.ts";
import type { OperationalReviewHitlDto } from "./operational-review-types.ts";
import { isExecutionOperationallyComplete } from "./review-operational-state.ts";
import {
  isRunApprovedForVersioning,
  isVersioningOperationallyComplete,
} from "./versioning-operational-state.ts";

export { isExecutionOperationallyComplete };
export { isVersioningOperationallyComplete };

export const EXECUTION_OPERATIONAL_STATUSES = [
  "awaiting_start",
  "starting",
  "running",
  "validating",
  "adjusting",
  "checkpoint",
  "blocked",
  "failed",
  "completed",
] as const;

export type ExecutionOperationalStatus =
  (typeof EXECUTION_OPERATIONAL_STATUSES)[number];

export const EXECUTION_OPERATIONAL_STATUS_LABELS_PT: Record<
  ExecutionOperationalStatus,
  string
> = {
  awaiting_start: "Pronto para iniciar",
  starting: "Preparando execução",
  running: "Aplicando alterações",
  validating: "Validando resultado",
  adjusting: "Ajustando automaticamente",
  checkpoint: "Salvando checkpoint",
  blocked: "Execução bloqueada",
  failed: "Falha na execução",
  completed: "Execução concluída",
};

/** Rótulos de etapa para o rail visual (sem termos técnicos). */
export const EXECUTION_STEP_LABELS_PT = [
  "Preparando execução",
  "Aplicando alterações",
  "Validando resultado",
  "Ajustando automaticamente",
  "Salvando checkpoint",
  "Concluído",
] as const;

export type ShouldShowExecutionPhasePanelInput = {
  isInitializationPhase: boolean;
  bundle: ClarificationBundleDto | null | undefined;
  summary: RunSummaryDto | null | undefined;
  executionLifecyclePhase: ExecutionLifecyclePhase | null;
  reviewHitl?: OperationalReviewHitlDto | null;
};

export function labelExecutionOperationalStatus(
  status: ExecutionOperationalStatus,
): string {
  return EXECUTION_OPERATIONAL_STATUS_LABELS_PT[status];
}

/** Fase visual Execução — após versionamento, até conclusão (sem review/PR final). */
export function shouldShowExecutionPhasePanel(
  input: ShouldShowExecutionPhasePanelInput,
): boolean {
  const {
    isInitializationPhase,
    bundle,
    summary,
    executionLifecyclePhase,
    reviewHitl,
  } = input;
  if (isInitializationPhase) return false;
  if (!summary) return false;
  if (!isRunApprovedForVersioning(bundle)) return false;
  if (!isVersioningOperationallyComplete(summary)) return false;
  if (summary.state === "cancelled") return false;

  if (isExecutionOperationallyComplete(executionLifecyclePhase, summary)) {
    if (reviewHitl?.status === "adjustment_requested") return true;
    return false;
  }

  return true;
}

export function deriveExecutionOperationalStatus(input: {
  lifecyclePhase: ExecutionLifecyclePhase | null;
  orchestrationState: OrchestrationState | null;
  executePending: boolean;
  jobStatus?: string | null;
}): ExecutionOperationalStatus {
  const { lifecyclePhase, orchestrationState, executePending, jobStatus } = input;

  if (executePending) return "starting";

  const phase = lifecyclePhase ?? "execution_pending";

  if (phase === "execution_completed") return "completed";
  if (phase === "execution_failed") return "failed";
  if (phase === "execution_blocked") return "blocked";
  if (phase === "review_running") return "validating";
  if (phase === "correction_running" || phase === "retry_running") return "adjusting";
  if (phase === "recovery_running" || phase === "rollback_running") return "checkpoint";
  if (phase === "execution_running") return "running";

  const orch = String(orchestrationState ?? "");
  if (orch === "execution_starting" || orch === "queued") return "starting";
  if (jobStatus === "running" || jobStatus === "pending") return "running";

  return "awaiting_start";
}

/** Traduz fase interna do lifecycle para cópia de utilizador. */
export function labelExecutionLifecycleForUser(
  phase: ExecutionLifecyclePhase | null | undefined,
): string {
  const p = phase ?? "execution_pending";
  switch (p) {
    case "execution_pending":
      return "Preparando execução";
    case "execution_running":
      return "Aplicando alterações";
    case "review_running":
      return "Validando resultado";
    case "correction_running":
    case "retry_running":
      return "Ajustando automaticamente";
    case "recovery_running":
    case "rollback_running":
      return "Salvando checkpoint";
    case "execution_blocked":
      return "Execução bloqueada";
    case "execution_failed":
      return "Falha na execução";
    case "execution_completed":
      return "Concluído";
    default:
      return "Aplicando alterações";
  }
}

/** Mini-task / subtask — sem expor review, correction, retry. */
export function labelSubtaskStateForUser(state: SubtaskExecutionState): string {
  switch (state) {
    case "pending":
      return "Pendente";
    case "queued":
      return "Em fila";
    case "running":
      return "Em curso";
    case "reviewing":
      return "Validando";
    case "correcting":
    case "retrying":
      return "Ajustando";
    case "blocked":
      return "Bloqueado";
    case "failed":
      return "Falhou";
    case "recovered":
      return "Recuperado";
    case "completed":
      return "Concluído";
    default:
      return "Pendente";
  }
}

export type ExecutionOperationalStep = {
  id: string;
  labelPt: string;
  state: "pending" | "active" | "done" | "failed";
};

/** Rail de etapas derivado do runtime (sem inventar passos). */
export function deriveExecutionOperationalSteps(input: {
  status: ExecutionOperationalStatus;
  lifecyclePhase: ExecutionLifecyclePhase | null;
  hasSubtasks: boolean;
}): ExecutionOperationalStep[] {
  const { status, lifecyclePhase, hasSubtasks } = input;

  const base: ExecutionOperationalStep[] = [
    { id: "prepare", labelPt: "Preparando execução", state: "pending" },
    {
      id: "apply",
      labelPt: "Aplicando alterações",
      state: "pending",
    },
    { id: "validate", labelPt: "Validando resultado", state: "pending" },
    { id: "adjust", labelPt: "Ajustando automaticamente", state: "pending" },
    { id: "checkpoint", labelPt: "Salvando checkpoint", state: "pending" },
    { id: "done", labelPt: "Concluído", state: "pending" },
  ];

  const markDoneUntil = (idx: number) => {
    for (let i = 0; i <= idx; i++) {
      base[i]!.state = "done";
    }
  };

  const setActive = (idx: number) => {
    markDoneUntil(idx - 1);
    base[idx]!.state = "active";
  };

  if (status === "awaiting_start") {
    base[0]!.state = "active";
    return base;
  }

  if (status === "starting") {
    setActive(0);
    return base;
  }

  if (status === "running") {
    setActive(hasSubtasks ? 1 : 1);
    return base;
  }

  if (status === "validating") {
    markDoneUntil(1);
    setActive(2);
    return base;
  }

  if (status === "adjusting") {
    markDoneUntil(2);
    setActive(3);
    return base;
  }

  if (status === "checkpoint") {
    markDoneUntil(3);
    setActive(4);
    return base;
  }

  if (status === "blocked") {
    const phase = lifecyclePhase ?? "execution_pending";
    if (phase === "review_running") setActive(2);
    else if (phase === "correction_running" || phase === "retry_running") setActive(3);
    else setActive(1);
    for (const step of base) {
      if (step.state === "active") step.state = "failed";
    }
    return base;
  }

  if (status === "failed") {
    setActive(1);
    for (const step of base) {
      if (step.state === "active") step.state = "failed";
    }
    return base;
  }

  if (status === "completed") {
    for (const step of base) step.state = "done";
    return base;
  }

  setActive(0);
  return base;
}

export function selectOperationalMiniTasks(
  subtasks: ExecutionSubtaskDto[],
): ExecutionSubtaskDto[] {
  return [...subtasks].sort((a, b) => a.order - b.order);
}

const MINI_ACTIVITY_STATUS_LABELS_PT: Record<
  MaterializedMiniActivityStatus,
  string
> = {
  pending: "Pendente",
  ready: "Pronta",
  blocked_by_dependency: "Bloqueada",
  running: "Em curso",
  review: "Em revisão",
  completed: "Concluída",
  failed: "Falhou",
  skipped: "Ignorada",
};

export function labelMaterializedMiniActivityStatus(
  status: MaterializedMiniActivityStatus,
): string {
  return MINI_ACTIVITY_STATUS_LABELS_PT[status] ?? status;
}

/** Rótulo operacional considerando subestado de correção/review. */
export function labelMiniActivityOperational(
  ma: MaterializedMiniActivityDto,
): string {
  if (ma.correctionPhase === "correction_running") return "Corrigindo";
  if (ma.correctionPhase === "correction_required" || ma.correctionRequired) {
    return "Correção necessária";
  }
  if (ma.status === "review") {
    if (ma.reviewStatus === "running" || ma.reviewStatus === "pending") {
      return "Em revisão";
    }
    if (ma.reviewStatus === "rejected") return "Revisão rejeitada";
  }
  return labelMaterializedMiniActivityStatus(ma.status);
}

export function selectMaterializedMiniActivities(
  miniActivities: MaterializedMiniActivityDto[],
): MaterializedMiniActivityDto[] {
  return [...miniActivities].sort((a, b) => a.order - b.order);
}

export function groupMaterializedMiniActivities(
  miniActivities: MaterializedMiniActivityDto[],
  currentMiniActivityId: string | null,
) {
  const sorted = selectMaterializedMiniActivities(miniActivities);
  const pinned =
    currentMiniActivityId != null
      ? sorted.find((m) => m.miniActivityId === currentMiniActivityId) ?? null
      : null;

  const running =
    pinned?.status === "running"
      ? pinned
      : sorted.find((m) => m.status === "running") ?? null;

  const correcting = sorted.filter(
    (m) => m.correctionPhase === "correction_running",
  );

  const correctionRequired = sorted.filter(
    (m) =>
      m.correctionPhase === "correction_required" ||
      (m.correctionRequired && m.correctionPhase !== "correction_running"),
  );

  const inReview = sorted.filter(
    (m) =>
      m.status === "review" &&
      m.correctionPhase !== "correction_running" &&
      m.correctionPhase !== "correction_required" &&
      !m.correctionRequired,
  );

  return {
    current: running,
    inReview,
    correcting,
    correctionRequired,
    upcoming: sorted.filter(
      (m) => m.status === "ready" || m.status === "pending",
    ),
    blocked: sorted.filter((m) => m.status === "blocked_by_dependency"),
    completed: sorted.filter(
      (m) => m.status === "completed" || m.status === "skipped",
    ),
    failed: sorted.filter((m) => m.status === "failed"),
  };
}
