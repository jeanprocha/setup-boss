import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { ExecutionLifecyclePhase } from "../execution/execution-types.ts";
import type { RunSummaryDto } from "../../api/runtime-types.ts";
import type { OperationalFinalizationHitlDto } from "./operational-finalization-types.ts";
import type { OperationalReviewHitlDto } from "./operational-review-types.ts";
import { isExecutionOperationallyComplete } from "./review-operational-state.ts";
import { isRunApprovedForVersioning } from "./versioning-operational-state.ts";

export const FINALIZATION_OPERATIONAL_STATUSES = [
  "awaiting_finalize",
  "finalized",
  "adjustment_requested",
] as const;

export type FinalizationOperationalStatus =
  (typeof FINALIZATION_OPERATIONAL_STATUSES)[number];

export const FINALIZATION_OPERATIONAL_STATUS_LABELS_PT: Record<
  FinalizationOperationalStatus,
  string
> = {
  awaiting_finalize: "Pronto para encerrar",
  finalized: "Atividade finalizada",
  adjustment_requested: "Ajuste final solicitado",
};

export type ShouldShowFinalizationPhasePanelInput = {
  isInitializationPhase: boolean;
  bundle: ClarificationBundleDto | null | undefined;
  summary: RunSummaryDto | null | undefined;
  executionLifecyclePhase: ExecutionLifecyclePhase | null;
  reviewHitl: OperationalReviewHitlDto | null | undefined;
  finalizationHitl: OperationalFinalizationHitlDto | null | undefined;
};

export function labelFinalizationOperationalStatus(
  status: FinalizationOperationalStatus,
): string {
  return FINALIZATION_OPERATIONAL_STATUS_LABELS_PT[status];
}

export function deriveFinalizationOperationalStatus(
  hitl: OperationalFinalizationHitlDto | null | undefined,
): FinalizationOperationalStatus {
  const st = hitl?.status ?? "pending";
  if (st === "finalized") return "finalized";
  if (st === "adjustment_requested") return "adjustment_requested";
  return "awaiting_finalize";
}

/** Fase visual Finalização — após review confirmado, encerramento operacional. */
export function shouldShowFinalizationPhasePanel(
  input: ShouldShowFinalizationPhasePanelInput,
): boolean {
  const {
    isInitializationPhase,
    bundle,
    summary,
    executionLifecyclePhase,
    reviewHitl,
    finalizationHitl,
  } = input;
  if (isInitializationPhase) return false;
  if (!summary) return false;
  if (!isRunApprovedForVersioning(bundle)) return false;
  if (!isExecutionOperationallyComplete(executionLifecyclePhase, summary)) {
    return false;
  }
  if (reviewHitl?.status !== "confirmed") return false;
  if (finalizationHitl?.status === "adjustment_requested") return false;
  return true;
}
