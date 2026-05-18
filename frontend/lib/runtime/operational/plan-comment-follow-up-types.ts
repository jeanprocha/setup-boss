import type { OperationalPlanPresentation } from "./operational-plan-types";

export type PlanAdditionalQuestionDto = {
  id: string;
  text: string;
};

export type PlanAdditionalQuestionsDto = {
  commentId: string;
  createdAt: string;
  questions: PlanAdditionalQuestionDto[];
};

export type PlanAdditionalAnswerRowDto = {
  questionId: string;
  question: string;
  answer: string;
};

export type PlanAdditionalAnswersDto = {
  commentId: string;
  submittedAt: string;
  answers: PlanAdditionalAnswerRowDto[];
};

export type PlanUpdatedPlanDto = {
  commentId: string;
  planVersion: number;
  schemaVersion?: number;
  canonicalized?: boolean;
  generatedAt: string;
  supersedesPlanVersion: number;
  presentation: OperationalPlanPresentation;
};
