"use client";

import { planCommentClassificationSummary } from "@/lib/runtime/operational/plan-comment-classification-ui";
import type { PlanCommentAnalysisDto } from "@/lib/runtime/operational/plan-comment-analysis-types";
import { PlanTimelineStatus } from "@/components/features/planning/PlanTimelineStatus";

export function PlanCommentAnalysisProcessing({
  blockId,
}: {
  blockId: string;
}) {
  return (
    <article
      id={`plan-timeline-block-${blockId}`}
      className="plan-approval-timeline-block plan-approval-timeline-block--analysis"
      data-timeline-kind="comment_analysis"
      aria-busy="true"
    >
      <PlanTimelineStatus>Analisando comentário…</PlanTimelineStatus>
    </article>
  );
}

export function PlanCommentAnalysisBlock({
  analysis,
  blockId,
}: {
  analysis: PlanCommentAnalysisDto;
  blockId: string;
}) {
  const summary = planCommentClassificationSummary(analysis);

  return (
    <article
      id={`plan-timeline-block-${blockId}`}
      className="plan-approval-timeline-block plan-approval-timeline-block--analysis"
      data-timeline-kind="comment_analysis"
    >
      <p className="plan-approval-timeline-block__summary">{summary}</p>
    </article>
  );
}
