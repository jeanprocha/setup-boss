import type { PlanCommentThreadState } from "./plan-approval-timeline-types";

/** Destino de scroll após interação na timeline. */
export type PlanTimelineScrollTarget =
  | { kind: "block"; blockId: string }
  | null;

/**
 * Resolve para onde fazer scroll quando um comentário termina de ser processado.
 */
export function resolveScrollAfterCommentAnalysis(
  thread: PlanCommentThreadState,
): PlanTimelineScrollTarget {
  if (thread.analysisStatus === "error") {
    return { kind: "block", blockId: thread.comment.id };
  }
  if (thread.analysisStatus !== "done" || !thread.analysis) {
    return { kind: "block", blockId: thread.comment.id };
  }

  if (thread.analysis.requiresQuestions && thread.additionalQuestions) {
    return { kind: "block", blockId: `questions-${thread.comment.id}` };
  }

  if (thread.analysis.requiresNewPlan) {
    if (thread.updatedPlan) {
      return { kind: "block", blockId: `updated-plan-${thread.comment.id}` };
    }
    if (thread.updatedPlanStatus === "generating") {
      return { kind: "block", blockId: `generating-plan-${thread.comment.id}` };
    }
    return { kind: "block", blockId: `response-${thread.comment.id}` };
  }

  return { kind: "block", blockId: `response-${thread.comment.id}` };
}

export function resolveScrollAfterUpdatedPlan(
  commentId: string,
): PlanTimelineScrollTarget {
  return { kind: "block", blockId: `updated-plan-${commentId}` };
}
