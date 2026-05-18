/** Classificação do comentário sobre o plano (Fase 2). */

export const PLAN_COMMENT_CLASSIFICATIONS = [
  "question",
  "no_change",
  "update_plan",
  "needs_questions",
] as const;

export type PlanCommentClassification =
  (typeof PLAN_COMMENT_CLASSIFICATIONS)[number];

export type PlanCommentAnalysisDto = {
  commentId: string;
  classification: PlanCommentClassification;
  reason: string;
  assistantResponse: string;
  requiresNewPlan: boolean;
  requiresQuestions: boolean;
  suggestedQuestions: string[];
  planChangeSummary: string;
  analyzedAt: string;
  mode: "llm" | "heuristic";
};

export type PlanCommentAnalysisStatus =
  | "idle"
  | "processing"
  | "done"
  | "error";

export type PlanCommentThreadDto = {
  comment: {
    id: string;
    text: string;
    createdAt: string;
    kind: "user_comment";
  };
  analysisStatus: PlanCommentAnalysisStatus;
  analysis: PlanCommentAnalysisDto | null;
  analysisError: string | null;
};
