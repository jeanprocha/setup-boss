"use client";

import { Surface } from "@/components/primitives/Surface";
import { CorrectionLoopCard } from "@/components/features/execution/CorrectionLoopCard";
import { ReviewExecutionCard } from "@/components/features/execution/ReviewExecutionCard";
import type {
  CorrectionLoopDto,
  ReviewStateDto,
} from "@/lib/runtime/execution/execution-types";

export function ReviewCorrectionCard({
  review,
  correction,
}: {
  review: ReviewStateDto;
  correction: CorrectionLoopDto;
}) {
  const hasReview =
    review.status !== "none" ||
    review.rejectionReason ||
    review.reviewerHint;
  const hasCorrection =
    correction.status !== "idle" || correction.generation > 0;

  if (!hasReview && !hasCorrection) return null;

  return (
    <Surface variant="inset" className="space-y-3 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Review · Correcção
      </p>
      <ReviewExecutionCard review={review} />
      <CorrectionLoopCard correction={correction} />
    </Surface>
  );
}
