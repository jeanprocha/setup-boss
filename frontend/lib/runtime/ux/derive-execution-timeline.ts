import type {
  RunUxActiveStep,
  RunUxState,
  RuntimeUxEvent,
  RuntimeUxKind,
} from "./runtime-ux-types.ts";
import {
  executionMacroActivityMessage,
  mapInternalActiveStepToVisual,
  mapUxKindToVisualCheckpoint,
  OPERATIONAL_VISUAL_STEP_LABELS,
  OPERATIONAL_VISUAL_STEP_ORDER,
  type OperationalVisualStepId,
  versioningCheckpointMessage,
  type VersioningCheckpointContext,
} from "./operational-visual-model.ts";

/** Alias público — checkpoints da timeline UX-C simplificada. */
export type ExecutionTimelineCheckpointId = OperationalVisualStepId;

export type ExecutionTimelineCheckpointStatus =
  | "completed"
  | "active"
  | "waiting"
  | "failed"
  | "pending"
  | "skipped";

export type ExecutionTimelineCheckpoint = {
  id: ExecutionTimelineCheckpointId;
  label: string;
  status: ExecutionTimelineCheckpointStatus;
  message: string;
  timestamp?: string | null;
  /** CTA dominante no passo Versionamento. */
  showPrepareBranchCta?: boolean;
};

export type ExecutionTimeline = {
  checkpoints: ExecutionTimelineCheckpoint[];
  activeCheckpointId: ExecutionTimelineCheckpointId | null;
};

export const EXECUTION_TIMELINE_CHECKPOINT_ORDER: readonly ExecutionTimelineCheckpointId[] =
  OPERATIONAL_VISUAL_STEP_ORDER;

const CHECKPOINT_LABELS = OPERATIONAL_VISUAL_STEP_LABELS;

export type DeriveExecutionTimelineOptions = {
  versioning?: VersioningCheckpointContext;
};

type CheckpointSignals = {
  touched: boolean;
  completed: boolean;
  failed: boolean;
  waiting: boolean;
  skipped: boolean;
  lastEvent: RuntimeUxEvent | null;
};

function readEventType(ev: RuntimeUxEvent): string {
  const raw = ev.raw as { type?: string } | undefined;
  return String(raw?.type ?? "").toLowerCase();
}

function readEventData(ev: RuntimeUxEvent): Record<string, unknown> {
  const raw = ev.raw as { data?: Record<string, unknown> } | undefined;
  return raw?.data && typeof raw.data === "object" ? raw.data : {};
}

function kindToCheckpointId(
  kind: RuntimeUxKind,
): ExecutionTimelineCheckpointId | null {
  return mapUxKindToVisualCheckpoint(kind);
}

function activeStepToCheckpointId(
  step: RunUxActiveStep,
): ExecutionTimelineCheckpointId | null {
  const visual = mapInternalActiveStepToVisual(step);
  if (visual === "failed") return null;
  return visual;
}

function buildSignals(
  events: readonly RuntimeUxEvent[],
): Map<ExecutionTimelineCheckpointId, CheckpointSignals> {
  const map = new Map<ExecutionTimelineCheckpointId, CheckpointSignals>();

  for (const id of EXECUTION_TIMELINE_CHECKPOINT_ORDER) {
    map.set(id, {
      touched: false,
      completed: false,
      failed: false,
      waiting: false,
      skipped: false,
      lastEvent: null,
    });
  }

  for (const ev of events) {
    const id = kindToCheckpointId(ev.kind);
    if (!id) continue;

    const sig = map.get(id)!;
    sig.touched = true;
    sig.lastEvent = ev;

    if (ev.phase === "failed") sig.failed = true;
    if (ev.phase === "waiting") sig.waiting = true;
    if (ev.phase === "completed") {
      const t = readEventType(ev);
      if (id === "execution" && t.startsWith("strategy_")) {
        /* strategy/review internos não fecham o macro-step Execução */
      } else {
        sig.completed = true;
      }
    }

    if (id === "versioning" && readEventType(ev) === "git_branch_prepared") {
      sig.completed = true;
    }

    if (id === "refined_plan") {
      const t = readEventType(ev);
      if (
        t === "clarification_approve" ||
        t === "clarification_approved" ||
        t === "approval_requested"
      ) {
        if (ev.phase === "completed" || t.startsWith("clarification_approve")) {
          sig.completed = true;
        }
        if (t === "approval_requested") sig.waiting = true;
      }
    }
  }

  return map;
}

function messageForCheckpoint(
  id: ExecutionTimelineCheckpointId,
  status: ExecutionTimelineCheckpointStatus,
  signals: CheckpointSignals,
  versioningCtx: VersioningCheckpointContext,
): string {
  if (id === "versioning") {
    const vStatus =
      status === "failed"
        ? "failed"
        : status === "completed"
          ? "completed"
          : status === "waiting" || status === "active"
            ? status
            : "pending";
    const msg = versioningCheckpointMessage(
      vStatus === "pending" ? "pending" : vStatus,
      {
        ...versioningCtx,
        branch:
          (versioningCtx.branch ??
            (signals.lastEvent
              ? String(readEventData(signals.lastEvent).branch ?? "")
              : null)) ||
          null,
      },
    );
    if (msg) return msg;
  }

  if (id === "execution") {
    if (status === "active" || status === "waiting") {
      return executionMacroActivityMessage(signals.lastEvent);
    }
    if (status === "completed") return "Execução concluída.";
    if (status === "failed") return "Falha durante a execução.";
  }

  const last = signals.lastEvent;
  if (last?.message?.trim() && status !== "pending") {
    if (id === "execution" && /estratégia/i.test(last.message)) {
      return executionMacroActivityMessage(last);
    }
    return last.message.trim();
  }

  switch (status) {
    case "completed":
      if (id === "completed") return "Corrida finalizada com sucesso.";
      if (id === "refined_plan") return "Plano refinado aprovado.";
      return "Etapa concluída.";
    case "active":
      if (id === "refined_plan") return "Plano refinado disponível.";
      return "Em progresso.";
    case "waiting":
      if (id === "clarification") return "Aguarda respostas de clarificação.";
      if (id === "refined_plan") return "Aguarda aprovação do plano refinado.";
      return "Aguarda ação humana.";
    case "failed":
      return "Falha nesta etapa.";
    case "skipped":
      return "Etapa omitida pelo runtime.";
    case "pending":
      return "";
    default:
      return "";
  }
}

function resolveCheckpointStatus(
  id: ExecutionTimelineCheckpointId,
  signals: CheckpointSignals,
  ux: RunUxState,
  checkpointIndex: number,
  activeIndex: number,
): ExecutionTimelineCheckpointStatus {
  if (id === "completed") {
    if (ux.status === "completed") return "completed";
    return "pending";
  }

  if (signals.failed) return "failed";

  if (signals.waiting) return "waiting";

  const visualStep = mapInternalActiveStepToVisual(ux.activeStep);
  const visualCompleted = ux.completedSteps
    .map((s) => mapInternalActiveStepToVisual(s as RunUxActiveStep))
    .filter((v): v is OperationalVisualStepId => v !== "failed");

  if (signals.completed || visualCompleted.includes(id)) {
    if (id === "execution" && visualStep === "execution" && ux.status === "running") {
      return "active";
    }
    return "completed";
  }

  const isActiveStep = visualStep === id;

  if (ux.hasHumanAction && isActiveStep) return "waiting";
  if (ux.status === "waiting_user_action" && isActiveStep) return "waiting";

  if (ux.status === "failed" && isActiveStep) return "failed";

  if (isActiveStep) {
    if (ux.status === "running") return "active";
    if (ux.status === "waiting_user_action") return "waiting";
  }

  if (signals.skipped) return "skipped";

  if (checkpointIndex < activeIndex && signals.touched) {
    return "completed";
  }

  return "pending";
}

function resolveActiveIndex(
  ux: RunUxState,
  signals: Map<ExecutionTimelineCheckpointId, CheckpointSignals>,
): number {
  const visual = mapInternalActiveStepToVisual(ux.activeStep);
  if (visual !== "failed") {
    return EXECUTION_TIMELINE_CHECKPOINT_ORDER.indexOf(visual);
  }

  if (ux.status === "failed") {
    for (let i = EXECUTION_TIMELINE_CHECKPOINT_ORDER.length - 1; i >= 0; i--) {
      const id = EXECUTION_TIMELINE_CHECKPOINT_ORDER[i]!;
      const sig = signals.get(id);
      if (sig?.failed) return i;
    }
  }

  return 0;
}

/**
 * Deriva timeline operacional por checkpoints a partir de eventos UX-A e estado dominante.
 * Modelo visual simplificado: 6 passos (sem estratégia/revisão/correção/conhecimento separados).
 */
export function deriveExecutionTimeline(
  events: readonly RuntimeUxEvent[],
  ux: RunUxState,
  options: DeriveExecutionTimelineOptions = {},
): ExecutionTimeline {
  const versioningCtx = options.versioning ?? {};
  const signals = buildSignals(events);
  const activeIndex = resolveActiveIndex(ux, signals);

  let activeCheckpointId: ExecutionTimelineCheckpointId | null = null;

  const checkpoints = EXECUTION_TIMELINE_CHECKPOINT_ORDER.map((id, index) => {
    const sig = signals.get(id)!;
    const status = resolveCheckpointStatus(id, sig, ux, index, activeIndex);

    if (status === "active" || status === "waiting") {
      activeCheckpointId = id;
    }

    const showPrepareBranchCta =
      id === "versioning" &&
      (status === "waiting" || status === "failed") &&
      (versioningCtx.executeBlockCode === "git_branch_required" ||
        versioningCtx.gitStatus === "git_branch_failed");

    return {
      id,
      label: CHECKPOINT_LABELS[id],
      status,
      message: messageForCheckpoint(id, status, sig, versioningCtx),
      timestamp:
        status === "completed" || status === "active" || status === "waiting"
          ? sig.lastEvent?.timestamp ?? null
          : null,
      showPrepareBranchCta,
    };
  });

  if (!activeCheckpointId && ux.status === "running") {
    const stepId = activeStepToCheckpointId(ux.activeStep);
    if (stepId && stepId !== "completed") {
      activeCheckpointId = stepId;
    }
  }

  if (ux.status === "completed") {
    activeCheckpointId = "completed";
  }

  return { checkpoints, activeCheckpointId };
}

/**
 * Mantém só o fluxo já ocorrido + etapa actual (omite checkpoints `pending` futuros).
 */
export function filterExecutionTimelineToActualFlow(
  timeline: ExecutionTimeline,
): ExecutionTimelineCheckpoint[] {
  const { checkpoints, activeCheckpointId } = timeline;

  const visible = checkpoints
    .filter((cp) => {
      if (cp.status !== "pending") return true;
      return activeCheckpointId != null && cp.id === activeCheckpointId;
    })
    .map((cp) => {
      if (cp.status !== "pending") return cp;
      return {
        ...cp,
        status: "active" as const,
        message: cp.message.trim() || "Em progresso.",
      };
    });

  if (visible.length > 0) return visible;

  const activeId = activeCheckpointId ?? "intake";
  const fallback = checkpoints.find((c) => c.id === activeId) ?? checkpoints[0];
  if (!fallback) return [];

  return [
    {
      ...fallback,
      status: "active",
      message: fallback.message.trim() || "Em progresso.",
    },
  ];
}
