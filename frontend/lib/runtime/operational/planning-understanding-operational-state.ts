import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import { shouldShowPlanningOperationalPlanPanel } from "./planning-operational-plan-state.ts";
import type { RunOperationalUxContract } from "./operational-ux-types.ts";

/** Estados operacionais da fase Montando o plano — loop de entendimento (Fase 3). */
export const PLANNING_UNDERSTANDING_STATUSES = [
  "analyzing_activity",
  "generating_questions",
  "awaiting_answers",
  "processing_answers",
  "evaluating_understanding",
  "generating_new_questions",
  "understanding_complete",
] as const;

export type PlanningUnderstandingStatus =
  (typeof PLANNING_UNDERSTANDING_STATUSES)[number];

export const PLANNING_UNDERSTANDING_STATUS_LABELS_PT: Record<
  PlanningUnderstandingStatus,
  string
> = {
  analyzing_activity: "A analisar a atividade",
  generating_questions: "A gerar perguntas de entendimento",
  awaiting_answers: "Aguardando as suas respostas",
  processing_answers: "A processar respostas",
  evaluating_understanding: "A avaliar entendimento",
  generating_new_questions: "A gerar novas perguntas",
  understanding_complete: "Entendimento concluído",
};

export type DerivePlanningUnderstandingStatusInput = {
  contract: RunOperationalUxContract;
  bundle: ClarificationBundleDto | null;
  clarificationLoading?: boolean;
  clarificationFetching?: boolean;
  submitPending?: boolean;
};

export function labelPlanningUnderstandingStatus(
  status: PlanningUnderstandingStatus,
): string {
  return PLANNING_UNDERSTANDING_STATUS_LABELS_PT[status];
}

/**
 * Deriva estado narrativo do loop de perguntas/respostas a partir do bundle real.
 * Não expõe `runtimePhase` / clarification na UI.
 */
export function derivePlanningUnderstandingStatus(
  input: DerivePlanningUnderstandingStatusInput,
): PlanningUnderstandingStatus {
  const {
    bundle,
    clarificationLoading,
    clarificationFetching,
    submitPending,
  } = input;

  if (!bundle) {
    return clarificationLoading || clarificationFetching
      ? "analyzing_activity"
      : "analyzing_activity";
  }

  const rp = bundle.session.runtimePhase;
  const pending = bundle.questions.filter((q) => q.status === "pending");
  const round = bundle.session.currentRound ?? 1;

  if (
    rp === "refinement_ready" ||
    rp === "awaiting_approval" ||
    bundle.refinement.available
  ) {
    return "understanding_complete";
  }

  if (rp === "refining" || submitPending) {
    return "processing_answers";
  }

  if (rp === "clarification_empty" || bundle.questions.length === 0) {
    if (
      round > 1 &&
      (clarificationLoading || clarificationFetching)
    ) {
      return "generating_new_questions";
    }
    return clarificationLoading || clarificationFetching
      ? "generating_questions"
      : "evaluating_understanding";
  }

  if (rp === "clarification_required" || clarificationFetching) {
    return pending.length > 0 ? "awaiting_answers" : "generating_questions";
  }

  if (pending.length > 0) {
    return "awaiting_answers";
  }

  if (
    bundle.questions.length > 0 &&
    pending.length === 0 &&
    !bundle.refinement.available
  ) {
    return "evaluating_understanding";
  }

  if (rp === "waiting_answers") {
    return pending.length > 0 ? "awaiting_answers" : "evaluating_understanding";
  }

  return "analyzing_activity";
}

/** Escopo da Fase 3: painel central de entendimento (perguntas/respostas). */
export function shouldShowPlanningUnderstandingPanel(input: {
  executionApplies: boolean;
  isInitializationPhase: boolean;
  clarificationApplies: boolean;
  bundle: ClarificationBundleDto | null | undefined;
}): boolean {
  if (shouldShowPlanningOperationalPlanPanel(input)) return false;

  const { executionApplies, isInitializationPhase, clarificationApplies, bundle } =
    input;
  if (executionApplies || isInitializationPhase) return false;
  if (!clarificationApplies || !bundle || bundle.source === "unsupported") {
    return false;
  }

  const rp = bundle.session.runtimePhase;
  if (
    rp === "approved" ||
    rp === "ready_for_execution" ||
    rp === "strategy_pending"
  ) {
    return false;
  }
  if (bundle.approval.status === "approved") return false;

  return true;
}
