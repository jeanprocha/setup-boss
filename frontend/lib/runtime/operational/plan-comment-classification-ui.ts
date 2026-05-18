import type { PlanCommentAnalysisDto } from "./plan-comment-analysis-types";

/** Resumo humano e discreto para a timeline (sem jargão interno). */
export function planCommentClassificationSummary(
  analysis: Pick<
    PlanCommentAnalysisDto,
    "classification" | "requiresNewPlan" | "requiresQuestions"
  >,
): string {
  if (analysis.requiresQuestions) {
    return "Precisamos de mais uma informação para atualizar o plano.";
  }
  if (analysis.requiresNewPlan) {
    return "Este comentário altera o plano.";
  }
  switch (analysis.classification) {
    case "question":
      return "Este comentário é uma dúvida.";
    case "no_change":
      return "Observação registada — o plano atual mantém-se.";
    case "update_plan":
      return "Este comentário altera o plano.";
    case "needs_questions":
      return "Precisamos de mais uma informação para atualizar o plano.";
    default:
      return "Comentário registado.";
  }
}
