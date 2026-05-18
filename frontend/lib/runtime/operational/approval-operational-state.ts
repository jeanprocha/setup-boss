import { shouldShowClarificationApprovalGate } from "../clarification/clarification-operational-state.ts";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { RunOperationalUxContract } from "./operational-ux-types.ts";

export const APPROVAL_OPERATIONAL_STATUSES = [
  "awaiting_decision",
  "returning_to_planning",
  "approved",
] as const;

export const APPROVAL_OPERATIONAL_STATUS_LABELS_PT = {
  awaiting_decision: "Aguardando a sua decisão",
  approved: "Plano aprovado",
  returning_to_planning: "A voltar ao planejamento",
} as const;

export type ApprovalOperationalStatus = keyof typeof APPROVAL_OPERATIONAL_STATUS_LABELS_PT;

/** Passos visíveis no rail da secção Aprovação do plano. */
export function approvalOperationalStatusRail(
  status: ApprovalOperationalStatus,
): ApprovalOperationalStatus[] {
  if (status === "returning_to_planning") {
    return ["awaiting_decision", "returning_to_planning"];
  }
  if (status === "approved") {
    return ["awaiting_decision", "approved"];
  }
  return ["awaiting_decision"];
}

export type ShouldShowApprovalPhasePanelInput = {
  executionApplies: boolean;
  isInitializationPhase: boolean;
  operationalUx: RunOperationalUxContract;
  bundle: ClarificationBundleDto | null | undefined;
};

/** Fase visual Aprovação — plano final pronto e decisão humana pendente. */
export function shouldShowApprovalPhasePanel(
  input: ShouldShowApprovalPhasePanelInput,
): boolean {
  const { executionApplies, isInitializationPhase, operationalUx, bundle } = input;
  if (executionApplies || isInitializationPhase) return false;
  if (!bundle || bundle.source === "unsupported") return false;
  if (bundle.approval.status === "approved") return false;

  if (operationalUx.uxPhase === "approval") return true;

  return (
    operationalUx.finalPlanReady &&
    shouldShowClarificationApprovalGate(bundle) &&
    bundle.approval.status !== "rejected"
  );
}

export function deriveApprovalOperationalStatus(
  bundle: ClarificationBundleDto | null,
  approvePending: boolean,
  refinePending: boolean,
): ApprovalOperationalStatus {
  if (refinePending) return "returning_to_planning";
  if (bundle?.approval.status === "approved") return "approved";
  return "awaiting_decision";
}

export function labelApprovalOperationalStatus(status: ApprovalOperationalStatus): string {
  return APPROVAL_OPERATIONAL_STATUS_LABELS_PT[status];
}

export type OperationalApprovalActions = {
  canApprove: boolean;
  /** @deprecated Use canAddPlanComment — fase 1 substitui “voltar ao planejamento” por comentário. */
  canReturnToPlanning: boolean;
  canAddPlanComment: boolean;
  blockedReason: string | null;
};

/**
 * Ações HITL com gate alinhado ao contrato operacional (inclui refinement_ready).
 */
export function deriveOperationalApprovalActions(
  bundle: ClarificationBundleDto,
  operationalUx: RunOperationalUxContract,
): OperationalApprovalActions {
  const phase = bundle.session.runtimePhase;
  const refinementReady = bundle.refinement.available;
  const pending = bundle.session.pendingBlockingCount;
  const gateOpen =
    operationalUx.uxPhase === "approval" ||
    operationalUx.finalPlanReady ||
    shouldShowClarificationApprovalGate(bundle);

  const canApprove =
    gateOpen &&
    refinementReady &&
    pending === 0 &&
    bundle.approval.status !== "approved" &&
    bundle.approval.status !== "rejected" &&
    (phase === "awaiting_approval" || phase === "refinement_ready");

  const canReturnToPlanning =
    bundle.approval.status !== "approved" &&
    (phase === "awaiting_approval" ||
      phase === "refinement_ready" ||
      phase === "rejected");

  const canAddPlanComment = canReturnToPlanning;

  let blockedReason: string | null = null;
  if (gateOpen && !refinementReady) {
    blockedReason = "O plano ainda está a ser finalizado. Aguarde um momento.";
  } else if (gateOpen && pending > 0) {
    blockedReason = "Ainda há perguntas de entendimento por responder.";
  } else if (!canApprove && !canReturnToPlanning) {
    blockedReason = "Não é possível alterar o plano neste momento.";
  }

  return { canApprove, canReturnToPlanning, canAddPlanComment, blockedReason };
}
