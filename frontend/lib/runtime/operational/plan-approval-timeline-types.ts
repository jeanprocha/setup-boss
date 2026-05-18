/** Blocos cumulativos da timeline de aprovação do plano (nunca substituem etapas anteriores). */

import type { PlanCommentAnalysisDto } from "@/lib/runtime/operational/plan-comment-analysis-types";
import type {
  PlanAdditionalAnswersDto,
  PlanAdditionalQuestionsDto,
  PlanUpdatedPlanDto,
} from "@/lib/runtime/operational/plan-comment-follow-up-types";
import type { OperationalPlanPresentation } from "@/lib/runtime/operational/operational-plan-types";

export const PLAN_APPROVAL_TIMELINE_BLOCK_KINDS = [
  "operational_plan",
  "user_comment",
  "comment_analysis",
  "assistant_response",
  "additional_questions",
  "additional_answers",
  "updated_plan",
] as const;

export type PlanApprovalTimelineBlockKind =
  (typeof PLAN_APPROVAL_TIMELINE_BLOCK_KINDS)[number];

export type PlanApprovalTimelineBlockBase = {
  id: string;
  kind: PlanApprovalTimelineBlockKind;
  createdAt: string;
};

export type PlanApprovalOperationalPlanBlock = PlanApprovalTimelineBlockBase & {
  kind: "operational_plan";
  planVersion: number;
};

export type PlanApprovalUserCommentBlock = PlanApprovalTimelineBlockBase & {
  kind: "user_comment";
  text: string;
};

export type PlanApprovalCommentAnalysisBlock = PlanApprovalTimelineBlockBase & {
  kind: "comment_analysis";
  commentId: string;
  classification: PlanCommentAnalysisDto["classification"];
  reason: string;
};

export type PlanApprovalAssistantResponseBlock = PlanApprovalTimelineBlockBase & {
  kind: "assistant_response";
  commentId: string;
  text: string;
  requiresNewPlan: boolean;
  requiresQuestions: boolean;
  suggestedQuestions: string[];
  planChangeSummary: string;
};

export type PlanApprovalAdditionalQuestionsBlock = PlanApprovalTimelineBlockBase & {
  kind: "additional_questions";
  commentId: string;
  questions: PlanAdditionalQuestionsDto["questions"];
};

export type PlanApprovalAdditionalAnswersBlock = PlanApprovalTimelineBlockBase & {
  kind: "additional_answers";
  commentId: string;
  answers: PlanAdditionalAnswersDto["answers"];
};

export type PlanApprovalUpdatedPlanBlock = PlanApprovalTimelineBlockBase & {
  kind: "updated_plan";
  commentId: string;
  planVersion: number;
  presentation: OperationalPlanPresentation;
};

export type PlanApprovalTimelineBlock =
  | PlanApprovalOperationalPlanBlock
  | PlanApprovalUserCommentBlock
  | PlanApprovalCommentAnalysisBlock
  | PlanApprovalAssistantResponseBlock
  | PlanApprovalAdditionalQuestionsBlock
  | PlanApprovalAdditionalAnswersBlock
  | PlanApprovalUpdatedPlanBlock;

export const PLAN_APPROVAL_TIMELINE_BLOCK_LABELS_PT: Record<
  PlanApprovalTimelineBlockKind,
  string
> = {
  operational_plan: "Plano operacional",
  user_comment: "Comentário sobre o plano",
  comment_analysis: "Análise do comentário",
  assistant_response: "Resposta do Setup Boss",
  additional_questions: "Perguntas adicionais",
  additional_answers: "Respostas adicionais",
  updated_plan: "Plano atualizado",
};

export function labelPlanApprovalTimelineBlock(
  kind: PlanApprovalTimelineBlockKind,
): string {
  return PLAN_APPROVAL_TIMELINE_BLOCK_LABELS_PT[kind];
}

export type PlanCommentFollowUpStatus = "idle" | "submitting" | "done" | "error";

export type PlanCommentThreadState = {
  comment: PlanApprovalUserCommentBlock;
  analysisStatus: "idle" | "processing" | "done" | "error";
  analysis: PlanCommentAnalysisDto | null;
  analysisError: string | null;
  additionalQuestions: PlanAdditionalQuestionsDto | null;
  additionalAnswers: PlanAdditionalAnswersDto | null;
  additionalAnswersStatus: PlanCommentFollowUpStatus;
  additionalAnswersError: string | null;
  updatedPlan: PlanUpdatedPlanDto | null;
  updatedPlanStatus: "idle" | "generating" | "done" | "error";
};

export type PlanApprovalTimelinePersistedStateV2 = {
  version: 2;
  threads: PlanCommentThreadState[];
};

export type PlanApprovalTimelinePersistedStateV1 = {
  comments: PlanApprovalUserCommentBlock[];
};

export type PlanApprovalTimelinePersistedState =
  PlanApprovalTimelinePersistedStateV2;

export function createPlanApprovalUserCommentBlock(
  text: string,
  id?: string,
): PlanApprovalUserCommentBlock {
  return {
    id:
      id ??
      `comment-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`}`,
    kind: "user_comment",
    createdAt: new Date().toISOString(),
    text: text.trim(),
  };
}

export function analysisToTimelineFollowUps(
  analysis: PlanCommentAnalysisDto,
): Array<
  PlanApprovalCommentAnalysisBlock | PlanApprovalAssistantResponseBlock
> {
  const ts = analysis.analyzedAt;
  const analysisBlock: PlanApprovalCommentAnalysisBlock = {
    id: `analysis-${analysis.commentId}`,
    kind: "comment_analysis",
    createdAt: ts,
    commentId: analysis.commentId,
    classification: analysis.classification,
    reason: analysis.reason,
  };

  const responseText =
    analysis.assistantResponse ||
    (analysis.requiresQuestions
      ? "Este comentário precisa de novas perguntas antes de atualizar o plano."
      : analysis.requiresNewPlan
        ? "O comentário altera o plano e será tratado na próxima etapa."
        : "Comentário registado.");

  const responseBlock: PlanApprovalAssistantResponseBlock = {
    id: `response-${analysis.commentId}`,
    kind: "assistant_response",
    createdAt: ts,
    commentId: analysis.commentId,
    text: responseText,
    requiresNewPlan: analysis.requiresNewPlan,
    requiresQuestions: analysis.requiresQuestions,
    suggestedQuestions: analysis.suggestedQuestions,
    planChangeSummary: analysis.planChangeSummary,
  };

  return [analysisBlock, responseBlock];
}
