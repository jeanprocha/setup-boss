import { isClarificationCollectionComplete } from "../clarification/clarification-operational-state.ts";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import { isStrategyGenerationComplete } from "../strategy/strategy-readiness.ts";
import type { StrategyBundleDto } from "../strategy/strategy-types.ts";
import type { RunOperationalUxContract } from "./operational-ux-types.ts";
import { translateOperationalPlan } from "./translate-operational-plan.ts";

/** Estados do plano operacional dentro de “Montando o plano” (Fase 4). */
export const PLANNING_OPERATIONAL_PLAN_STATUSES = [
  "generating_plan",
  "presenting_plan",
  "plan_final_generated",
] as const;

export type PlanningOperationalPlanStatus =
  (typeof PLANNING_OPERATIONAL_PLAN_STATUSES)[number];

export const PLANNING_OPERATIONAL_PLAN_STATUS_LABELS_PT: Record<
  PlanningOperationalPlanStatus,
  string
> = {
  generating_plan: "A gerar plano",
  presenting_plan: "Plano disponível",
  plan_final_generated: "Plano final gerado",
};

export type DerivePlanningOperationalPlanStatusInput = {
  contract: RunOperationalUxContract;
  clarification: ClarificationBundleDto | null;
  strategy?: StrategyBundleDto | null;
  strategyApplies?: boolean;
  clarificationLoading?: boolean;
  clarificationFetching?: boolean;
  strategyLoading?: boolean;
  strategyFetching?: boolean;
};

export function labelPlanningOperationalPlanStatus(
  status: PlanningOperationalPlanStatus,
): string {
  return PLANNING_OPERATIONAL_PLAN_STATUS_LABELS_PT[status];
}

export function derivePlanningOperationalPlanStatus(
  input: DerivePlanningOperationalPlanStatusInput,
): PlanningOperationalPlanStatus {
  const {
    clarification,
    strategy,
    strategyApplies = false,
    clarificationLoading,
    clarificationFetching,
    strategyLoading,
    strategyFetching,
  } = input;

  if (!clarification) {
    return clarificationLoading || clarificationFetching
      ? "generating_plan"
      : "generating_plan";
  }

  const rp = clarification.session.runtimePhase;
  const refining = rp === "refining";
  const strategyPhase = strategy?.summary.runtimePhase;
  const strategyGenerating =
    strategyPhase === "strategy_generating" ||
    strategyPhase === "strategy_pending";

  if (
    refining ||
    strategyGenerating ||
    ((clarificationLoading || clarificationFetching) &&
      !clarification.refinement.available)
  ) {
    return "generating_plan";
  }

  if (strategyApplies && (strategyLoading || strategyFetching) && !strategy) {
    return "generating_plan";
  }

  const plan = translateOperationalPlan({ clarification, strategy });
  if (!plan.hasContent) {
    return "generating_plan";
  }

  const strategyComplete =
    strategyApplies && strategy
      ? isStrategyGenerationComplete(strategy)
      : false;

  if (strategyComplete) {
    return "plan_final_generated";
  }

  if (clarification.refinement.available && !strategyApplies) {
    return "plan_final_generated";
  }

  if (clarification.refinement.available && strategyApplies) {
    return strategyGenerating ? "generating_plan" : "presenting_plan";
  }

  if (isClarificationCollectionComplete(clarification)) {
    return "presenting_plan";
  }

  return "generating_plan";
}

export type ShouldShowPlanningOperationalPlanInput = {
  executionApplies: boolean;
  isInitializationPhase: boolean;
  clarificationApplies: boolean;
  bundle: ClarificationBundleDto | null | undefined;
};

/** Painel do plano operacional — após entendimento ou geração do plano. */
export function shouldShowPlanningOperationalPlanPanel(
  input: ShouldShowPlanningOperationalPlanInput,
): boolean {
  const { executionApplies, isInitializationPhase, clarificationApplies, bundle } =
    input;
  if (executionApplies || isInitializationPhase) return false;
  if (!clarificationApplies || !bundle || bundle.source === "unsupported") {
    return false;
  }

  const rp = bundle.session.runtimePhase;
  if (rp === "approved" || rp === "ready_for_execution") {
    return bundle.approval.status !== "approved";
  }

  if (rp === "refining") return true;
  if (isClarificationCollectionComplete(bundle)) return true;

  return false;
}
