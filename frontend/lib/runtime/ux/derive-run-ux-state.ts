import {
  RUN_UX_STALL_MS,
  type DeriveRunUxStateOptions,
  type RunUxActiveStep,
  type RunUxState,
  type RunUxStatus,
  type RuntimeUxEvent,
  type RuntimeUxKind,
} from "./runtime-ux-types.ts";
import {
  executionMacroActivityMessage,
  mapInternalActiveStepToVisual,
} from "./operational-visual-model.ts";

const TERMINAL_RUN_TYPES = new Set([
  "execution_completed",
  "job_completed",
  "workspace_run.completed",
  "run_completed",
]);

const TERMINAL_FAIL_TYPES = new Set([
  "execution_failed",
  "strategy_failed",
  "job_failed",
  "recovery_failed",
  "workspace_run.failed",
  "workspace_run.error",
  "phase_failed",
]);

const WAITING_TYPES = new Set([
  "approval_requested",
  "clarification_questions_generated",
  "workspace_run.waiting_user_action",
]);

const PROGRESS_KINDS = new Set<RuntimeUxKind>([
  "intake",
  "clarification",
  "plan",
  "approval",
  "git",
  "strategy",
  "execution",
  "review",
  "correction",
  "workspace",
]);

const HEADLINES: Record<RunUxActiveStep, string> = {
  intake: "Processando intake",
  clarification: "Clarificação em curso",
  plan: "Plano refinado em preparação",
  approval: "Aguardando aprovação do plano refinado",
  git: "A preparar branch",
  strategy: "Execução em curso",
  execution: "Execução em curso",
  review: "Execução em curso",
  correction: "Execução em curso",
  completed: "Corrida concluída",
  failed: "Corrida falhou",
};

const DEFAULT_STATE: RunUxState = {
  activeStep: "intake",
  visualStep: "intake",
  status: "running",
  headline: "A iniciar execução",
  detail: "A recolher o primeiro progresso da corrida…",
  lastEventAt: null,
  hasHumanAction: false,
  isStalled: false,
  completedSteps: [],
};

function kindToActiveStep(kind: RuntimeUxKind): RunUxActiveStep | null {
  if (kind === "system" || kind === "unknown" || kind === "knowledge") {
    return null;
  }
  /** Workspace sync correlaciona com execução/orquestração. */
  if (kind === "workspace") return "execution";
  return kind;
}

function isMeaningfulProgress(event: RuntimeUxEvent): boolean {
  if (!PROGRESS_KINDS.has(event.kind)) return false;
  if (event.phase === "info") return false;
  return true;
}

function isTerminalSuccess(event: RuntimeUxEvent): boolean {
  const t = String((event.raw as { type?: string })?.type ?? "").toLowerCase();
  if (TERMINAL_RUN_TYPES.has(t)) return true;
  if (event.phase === "completed" && event.kind === "execution") return true;
  if (event.kind === "workspace" && event.phase === "completed") return true;
  return false;
}

function isTerminalFailure(event: RuntimeUxEvent): boolean {
  const t = String((event.raw as { type?: string })?.type ?? "").toLowerCase();
  if (TERMINAL_FAIL_TYPES.has(t)) return true;
  return event.phase === "failed";
}

function isWaitingUser(event: RuntimeUxEvent): boolean {
  const t = String((event.raw as { type?: string })?.type ?? "").toLowerCase();
  if (WAITING_TYPES.has(t)) return true;
  return event.phase === "waiting";
}

function collectCompletedSteps(events: RuntimeUxEvent[]): string[] {
  const steps = new Set<string>();
  for (const ev of events) {
    if (ev.phase !== "completed") continue;
    const step = kindToActiveStep(ev.kind);
    if (step && step !== "completed" && step !== "failed") {
      steps.add(step);
    }
    if (isTerminalSuccess(ev)) steps.add("execution");
  }
  return [...steps];
}

function resolveStatus(
  last: RuntimeUxEvent | null,
  events: RuntimeUxEvent[],
): RunUxStatus {
  if (!last) return "running";
  if (events.some(isTerminalFailure)) return "failed";
  if (events.some(isTerminalSuccess)) return "completed";
  if (isWaitingUser(last)) return "waiting_user_action";
  if (last.phase === "failed") return "failed";
  if (last.phase === "completed" && last.kind !== "execution") {
    return "running";
  }
  return "running";
}

function resolveActiveStep(
  last: RuntimeUxEvent | null,
  events: RuntimeUxEvent[],
  status: RunUxStatus,
): RunUxActiveStep {
  if (status === "completed") return "completed";
  if (status === "failed") {
    const failed = [...events].reverse().find(isTerminalFailure);
    const step = failed ? kindToActiveStep(failed.kind) : null;
    return step ?? "failed";
  }
  if (!last) return "intake";

  const fromKind = kindToActiveStep(last.kind);
  if (fromKind) return fromKind;

  const lastMeaningful = [...events]
    .reverse()
    .find((e) => kindToActiveStep(e.kind) != null);
  return lastMeaningful ? kindToActiveStep(lastMeaningful.kind)! : "intake";
}

function buildHeadline(
  activeStep: RunUxActiveStep,
  status: RunUxStatus,
  last: RuntimeUxEvent | null,
  isStalled: boolean,
): string {
  if (isStalled && status === "running") {
    return "Ainda a processar…";
  }
  if (status === "waiting_user_action") {
    if (activeStep === "approval") return "Aprovação do plano refinado necessária";
    if (activeStep === "clarification") return "Respostas necessárias";
    if (activeStep === "git") return "Branch ainda não preparada";
    return "Ação humana necessária";
  }
  if (
    status === "running" &&
    (activeStep === "strategy" ||
      activeStep === "execution" ||
      activeStep === "review" ||
      activeStep === "correction")
  ) {
    return executionMacroActivityMessage(last);
  }
  if (last?.title && status === "running" && !/estratégia/i.test(last.title)) {
    return last.title;
  }
  return HEADLINES[activeStep];
}

function buildDetail(
  activeStep: RunUxActiveStep,
  status: RunUxStatus,
  last: RuntimeUxEvent | null,
  isStalled: boolean,
  lastProgressAt: string | null,
  nowMs: number,
): string {
  if (isStalled && lastProgressAt) {
    const silentMs = nowMs - Date.parse(lastProgressAt);
    const sec = Math.max(0, Math.floor(silentMs / 1000));
    return `Sem progresso relevante há ${sec}s.`;
  }
  if (last?.message?.trim()) return last.message.trim();
  if (status === "waiting_user_action") {
    return HEADLINES[activeStep];
  }
  if (status === "completed") return "Todas as etapas operacionais terminaram.";
  if (status === "failed") return "Verifique os logs ou tente recuperar a corrida.";
  return HEADLINES[activeStep];
}

function findLastProgressAt(events: RuntimeUxEvent[]): string | null {
  let last: string | null = null;
  for (const ev of events) {
    if (!isMeaningfulProgress(ev)) continue;
    last = ev.timestamp;
  }
  return last;
}

/**
 * Deriva estado UX dominante a partir de eventos normalizados.
 * Função pura — sem React, sem stores.
 */
export function deriveRunUxState(
  events: readonly RuntimeUxEvent[],
  options: DeriveRunUxStateOptions = {},
): RunUxState {
  const nowMs = options.nowMs ?? Date.now();
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );

  if (!sorted.length) return { ...DEFAULT_STATE };

  const last = sorted[sorted.length - 1] ?? null;
  const completedSteps = collectCompletedSteps(sorted);
  const status = resolveStatus(last, sorted);
  const activeStep = resolveActiveStep(last, sorted, status);
  const visualMapped = mapInternalActiveStepToVisual(activeStep);
  const visualStep = visualMapped === "failed" ? "failed" : visualMapped;
  const lastProgressAt = findLastProgressAt(sorted);
  const hasHumanAction =
    status === "waiting_user_action" ||
    sorted.some((e) => isWaitingUser(e));

  const isStalled =
    status === "running" &&
    lastProgressAt != null &&
    Number.isFinite(Date.parse(lastProgressAt)) &&
    nowMs - Date.parse(lastProgressAt) > RUN_UX_STALL_MS;

  const headline = buildHeadline(activeStep, status, last, isStalled);
  const detail = buildDetail(
    activeStep,
    status,
    last,
    isStalled,
    lastProgressAt,
    nowMs,
  );

  return {
    activeStep,
    visualStep,
    status,
    headline,
    detail,
    lastEventAt: last?.timestamp ?? null,
    hasHumanAction,
    isStalled,
    completedSteps,
  };
}
