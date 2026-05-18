import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import { mapPhase2StatusToRuntimePhase } from "@/lib/runtime/clarification/clarification-state";

type ApiQuestion = {
  id?: string;
  prompt?: string;
  kind?: string;
  type?: string;
  blocking?: boolean;
  options?: string[];
  status?: string;
  answer?: string | null;
};

type ApiBundleJson = {
  ok?: boolean;
  data?: {
    session?: Record<string, unknown>;
    questions?: ApiQuestion[];
    answers?: { questionId?: string; value?: string; recordedAt?: string | null }[];
    refinement?: Record<string, unknown>;
    approval?: Record<string, unknown>;
    source?: string;
    unsupportedReason?: string | null;
  };
};

function str(v: unknown): string {
  return v != null ? String(v) : "";
}

function mapQuestion(q: ApiQuestion) {
  const kind =
    q.kind === "single_choice" || q.kind === "confirm"
      ? q.kind
      : q.type === "single_choice" || q.type === "confirm"
        ? q.type
        : "free_text";
  const status = q.status;
  const uiStatus =
    status === "answered" ||
    status === "approved" ||
    status === "rejected" ||
    status === "needs_refinement" ||
    status === "pending"
      ? status
      : "pending";
  return {
    id: str(q.id),
    prompt: str(q.prompt),
    kind: kind as ClarificationBundleDto["questions"][0]["kind"],
    blocking: Boolean(q.blocking),
    options: Array.isArray(q.options) ? q.options.map((o) => str(o)) : [],
    status: uiStatus as ClarificationBundleDto["questions"][0]["status"],
    answer: q.answer != null ? str(q.answer) : null,
  };
}

export function mapApiClarificationBundle(
  json: ApiBundleJson,
  runId: string,
): ClarificationBundleDto | null {
  if (!json.ok || !json.data) return null;
  const d = json.data;
  const sessionRaw = d.session ?? {};
  const approvalRaw = d.approval ?? {};
  const approvalStatus =
    approvalRaw.status === "approved" ||
    approvalRaw.status === "rejected" ||
    approvalRaw.status === "pending"
      ? approvalRaw.status
      : "none";

  const sessionBase = {
    runId: str(sessionRaw.runId) || runId,
    phase2Status:
      sessionRaw.phase2Status != null
        ? str(sessionRaw.phase2Status)
        : null,
    runtimePhase: "unavailable" as const,
    currentRound:
      typeof sessionRaw.currentRound === "number"
        ? sessionRaw.currentRound
        : 0,
    questionsCount:
      typeof sessionRaw.questionsCount === "number"
        ? sessionRaw.questionsCount
        : 0,
    answersCount:
      typeof sessionRaw.answersCount === "number" ? sessionRaw.answersCount : 0,
    pendingBlockingCount:
      typeof sessionRaw.pendingBlockingCount === "number"
        ? sessionRaw.pendingBlockingCount
        : 0,
    localFallbackGenerationFailed:
      sessionRaw.localFallbackGenerationFailed === true,
    localFallbackGenerationDetail:
      sessionRaw.localFallbackGenerationFailed === true &&
      sessionRaw.localFallbackGenerationDetail != null
        ? str(sessionRaw.localFallbackGenerationDetail)
        : null,
    updatedAt:
      sessionRaw.updatedAt != null ? str(sessionRaw.updatedAt) : null,
  };

  const serverPhase =
    sessionRaw.runtimePhase != null
      ? String(sessionRaw.runtimePhase)
      : null;
  const runtimePhase = mapPhase2StatusToRuntimePhase(
    sessionBase.phase2Status,
    sessionBase,
    approvalStatus,
    serverPhase as ClarificationBundleDto["session"]["runtimePhase"] | null,
  );

  const refinementRaw = d.refinement ?? {};
  const execReady = refinementRaw.executionReadiness;
  const executionReadiness =
    execReady === "ready" ||
    execReady === "pending_approval" ||
    execReady === "not_ready"
      ? execReady
      : "not_ready";

  return {
    session: { ...sessionBase, runtimePhase },
    questions: Array.isArray(d.questions) ? d.questions.map(mapQuestion) : [],
    answers: Array.isArray(d.answers)
      ? d.answers.map((a) => ({
          questionId: str(a.questionId),
          value: str(a.value),
          recordedAt: a.recordedAt != null ? str(a.recordedAt) : null,
        }))
      : [],
    refinement: {
      available: Boolean(refinementRaw.available),
      refinedTask:
        refinementRaw.refinedTask != null
          ? str(refinementRaw.refinedTask)
          : null,
      scopeChanges: Array.isArray(refinementRaw.scopeChanges)
        ? refinementRaw.scopeChanges.map((x) => str(x))
        : [],
      acceptanceCriteria: Array.isArray(refinementRaw.acceptanceCriteria)
        ? refinementRaw.acceptanceCriteria.map((x) => str(x))
        : [],
      risks: Array.isArray(refinementRaw.risks)
        ? refinementRaw.risks.map((x) => str(x))
        : [],
      executionReadiness,
    },
    approval: {
      status: approvalStatus,
      notes: approvalRaw.notes != null ? str(approvalRaw.notes) : null,
      decidedAt:
        approvalRaw.decidedAt != null ? str(approvalRaw.decidedAt) : null,
      planRef: approvalRaw.planRef != null ? str(approvalRaw.planRef) : null,
    },
    source:
      d.source === "runtime" || d.source === "mock" || d.source === "unsupported"
        ? d.source
        : "runtime",
    unsupportedReason:
      d.unsupportedReason != null ? str(d.unsupportedReason) : null,
  };
}
