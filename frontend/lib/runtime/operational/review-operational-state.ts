import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { ExecutionLifecyclePhase } from "../execution/execution-types.ts";
import type { RunSummaryDto } from "../../api/runtime-types.ts";
import type { OperationalReviewHitlDto } from "./operational-review-types.ts";
import { isRunApprovedForVersioning } from "./versioning-operational-state.ts";

export const REVIEW_OPERATIONAL_STATUSES = [
  "awaiting_review",
  "confirmed",
  "adjustment_requested",
] as const;

export type ReviewOperationalStatus =
  (typeof REVIEW_OPERATIONAL_STATUSES)[number];

export const REVIEW_OPERATIONAL_STATUS_LABELS_PT: Record<
  ReviewOperationalStatus,
  string
> = {
  awaiting_review: "Aguardando a sua validação",
  confirmed: "Review concluído",
  adjustment_requested: "Ajuste solicitado",
};

export type ShouldShowReviewPhasePanelInput = {
  isInitializationPhase: boolean;
  bundle: ClarificationBundleDto | null | undefined;
  summary: RunSummaryDto | null | undefined;
  executionLifecyclePhase: ExecutionLifecyclePhase | null;
  hitl: OperationalReviewHitlDto | null | undefined;
};

export function isExecutionOperationallyComplete(
  lifecyclePhase: ExecutionLifecyclePhase | null | undefined,
  summary: RunSummaryDto | null | undefined,
): boolean {
  if (lifecyclePhase === "execution_completed") return true;
  if (lifecyclePhase && lifecyclePhase !== "execution_pending") return false;
  const st = String(summary?.state ?? "").toLowerCase();
  const ph = String(summary?.phase ?? "").toLowerCase();
  return st === "success" && (ph === "execution" || ph === "review");
}

export function labelReviewOperationalStatus(
  status: ReviewOperationalStatus,
): string {
  return REVIEW_OPERATIONAL_STATUS_LABELS_PT[status];
}

export function deriveReviewOperationalStatus(
  hitl: OperationalReviewHitlDto | null | undefined,
): ReviewOperationalStatus {
  const st = hitl?.status ?? "pending";
  if (st === "confirmed") return "confirmed";
  if (st === "adjustment_requested") return "adjustment_requested";
  return "awaiting_review";
}

/** Fase visual Review — após execução concluída, validação humana do resultado. */
export function shouldShowReviewPhasePanel(
  input: ShouldShowReviewPhasePanelInput,
): boolean {
  const { isInitializationPhase, bundle, summary, executionLifecyclePhase, hitl } =
    input;
  if (isInitializationPhase) return false;
  if (!summary) return false;
  if (!isRunApprovedForVersioning(bundle)) return false;
  if (!isExecutionOperationallyComplete(executionLifecyclePhase, summary)) {
    return false;
  }
  if (hitl?.status === "confirmed") return false;
  if (hitl?.status === "adjustment_requested") return false;
  return true;
}
