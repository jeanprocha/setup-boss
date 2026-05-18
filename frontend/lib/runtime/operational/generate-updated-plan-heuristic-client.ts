import type { OperationalPlanPresentation } from "./operational-plan-types";
import type { PlanCommentAnalysisDto } from "./plan-comment-analysis-types";
// Módulo Node partilhado no monorepo (fallback cliente = mesmas regras do runtime).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateFullUpdatedPlanPresentation } = require("../../../../core/generate-full-updated-plan-presentation.js") as {
  generateFullUpdatedPlanPresentation: (input: {
    planExcerpt?: string;
    basePresentation?: OperationalPlanPresentation | null;
    parsedExcerpt?: Record<string, unknown> | null;
    commentText: string;
    analysis?: PlanCommentAnalysisDto | null;
    additionalAnswers?: Array<{ question: string; answer: string }> | null;
  }) => OperationalPlanPresentation;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parsePlanExcerpt } = require("../../../../core/parse-plan-excerpt.js") as {
  parsePlanExcerpt: (excerpt: string) => Record<string, unknown>;
};

/** Fallback cliente espelhando regras do runtime quando API indisponível. */
export function generateUpdatedPlanHeuristicClient(input: {
  basePresentation?: OperationalPlanPresentation | null;
  planExcerpt?: string;
  commentText: string;
  analysis?: PlanCommentAnalysisDto | null;
  additionalAnswers?: Array<{ question: string; answer: string }> | null;
}): OperationalPlanPresentation {
  const parsed = parsePlanExcerpt(input.planExcerpt ?? "");
  return generateFullUpdatedPlanPresentation({
    planExcerpt: input.planExcerpt,
    basePresentation: input.basePresentation,
    parsedExcerpt: parsed,
    commentText: input.commentText,
    analysis: input.analysis,
    additionalAnswers: input.additionalAnswers,
  });
}
