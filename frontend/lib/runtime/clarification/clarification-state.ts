import type {
  ClarificationAvailability,
  ClarificationBundleDto,
  ClarificationRuntimePhase,
  ClarificationSessionDto,
} from "@/lib/runtime/clarification/clarification-types";

export type ClarificationConnectionContext = {
  runtimeReachable: boolean;
  connectionDegraded: boolean;
};

const PHASE2_TO_RUNTIME: Record<string, ClarificationRuntimePhase> = {
  answers_recorded: "refinement_ready",
  plan_refined: "awaiting_approval",
  ready_for_execution: "ready_for_execution",
  approval_rejected: "rejected",
};

export function mapPhase2StatusToRuntimePhase(
  phase2Status: string | null,
  session: Pick<
    ClarificationSessionDto,
    "pendingBlockingCount" | "answersCount" | "questionsCount"
  >,
  approvalStatus: ClarificationBundleDto["approval"]["status"],
  serverRuntimePhase?: ClarificationRuntimePhase | null,
): ClarificationRuntimePhase {
  const qc =
    typeof session.questionsCount === "number" ? session.questionsCount : 0;
  const stRaw = phase2Status ? String(phase2Status).trim() : "";

  if (approvalStatus === "approved") {
    if (stRaw === "ready_for_execution") {
      if (
        serverRuntimePhase === "strategy_pending" ||
        serverRuntimePhase === "ready_for_execution"
      ) {
        return serverRuntimePhase;
      }
      return "ready_for_execution";
    }
    return "approved";
  }
  if (approvalStatus === "rejected") return "rejected";

  if (stRaw === "ready_for_execution") {
    if (
      serverRuntimePhase === "strategy_pending" ||
      serverRuntimePhase === "ready_for_execution"
    ) {
      return serverRuntimePhase;
    }
    return "ready_for_execution";
  }

  if (serverRuntimePhase && serverRuntimePhase !== "unavailable") {
    if (
      serverRuntimePhase === "clarification_required" &&
      qc === 0 &&
      (stRaw === "clarification_initialized" || stRaw === "questions_generated")
    ) {
      return "clarification_empty";
    }
    return serverRuntimePhase;
  }

  if (
    (stRaw === "clarification_initialized" || stRaw === "questions_generated") &&
    qc === 0
  ) {
    return "clarification_empty";
  }

  if (phase2Status === "questions_generated" && session.pendingBlockingCount > 0) {
    return "waiting_answers";
  }
  if (phase2Status === "answers_recorded") {
    return session.pendingBlockingCount > 0 ? "waiting_answers" : "refining";
  }
  if (phase2Status === "plan_refined") return "awaiting_approval";
  if (phase2Status === "ready_for_execution") return "ready_for_execution";

  if (stRaw === "clarification_initialized" && qc > 0) {
    return "clarification_required";
  }

  const base = phase2Status ? PHASE2_TO_RUNTIME[phase2Status] : null;
  if (phase2Status === "questions_generated") {
    return qc > 0 ? "refining" : "clarification_empty";
  }

  return base ?? "unavailable";
}

export function deriveClarificationAvailability(
  bundle: ClarificationBundleDto | null,
  ctx: ClarificationConnectionContext,
): ClarificationAvailability {
  if (!bundle || bundle.source === "unsupported") {
    return {
      canSubmitAnswers: false,
      canApprove: false,
      canReject: false,
      canRequestRefinement: false,
      blockedReason:
        bundle?.unsupportedReason ??
        "Clarificação indisponível para esta corrida.",
    };
  }

  if (!ctx.runtimeReachable) {
    return {
      canSubmitAnswers: false,
      canApprove: false,
      canReject: false,
      canRequestRefinement: false,
      blockedReason: "Runtime offline — acções HITL bloqueadas.",
    };
  }

  const phase = bundle.session.runtimePhase;

  if (phase === "clarification_empty") {
    return {
      canSubmitAnswers: false,
      canApprove: false,
      canReject: false,
      canRequestRefinement: false,
      blockedReason: null,
    };
  }

  const pending = bundle.session.pendingBlockingCount;
  const refinementReady = bundle.refinement.available;

  const canSubmitAnswers =
    (phase === "waiting_answers" ||
      phase === "clarification_required" ||
      (phase === "refinement_ready" && pending > 0)) &&
    bundle.approval.status !== "approved" &&
    bundle.approval.status !== "rejected";

  const canApprove =
    phase === "awaiting_approval" && refinementReady && pending === 0;
  const canReject =
    (phase === "awaiting_approval" || phase === "approved") &&
    bundle.approval.status !== "rejected";
  const canRequestRefinement =
    phase === "awaiting_approval" || phase === "rejected";

  let blockedReason: string | null = null;
  if (phase === "awaiting_approval" && !refinementReady) {
    blockedReason = "Refinement ainda não disponível — aguarde ou submeta respostas.";
  }
  if (ctx.connectionDegraded && (canSubmitAnswers || canApprove)) {
    blockedReason =
      blockedReason ??
      "Runtime degradado — confirme antes de submeter decisões críticas.";
  }

  return {
    canSubmitAnswers,
    canApprove,
    canReject,
    canRequestRefinement,
    blockedReason,
  };
}

export function clarificationAppliesToRun(
  phaseRaw: string | null | undefined,
  stateRaw: string | null | undefined,
): boolean {
  const p = String(phaseRaw || "").toLowerCase();
  const s = String(stateRaw || "").toLowerCase();
  if (p.includes("clarif")) return true;
  if (s === "waiting_clarification_questions") return true;
  if (s === "waiting_clarification_answers") return true;
  if (s === "waiting_approval") return true;
  if (p === "intake" && s !== "success") return true;
  if (p.includes("strategy") && s !== "success") return true;
  return false;
}

export function canSubmitAnswersPayload(
  answers: { questionId: string; value: string }[],
): { ok: true } | { ok: false; reason: string } {
  const nonEmpty = answers.filter((a) => a.value.trim());
  if (!nonEmpty.length) {
    return { ok: false, reason: "Nenhuma resposta nova para submeter." };
  }
  return { ok: true };
}
