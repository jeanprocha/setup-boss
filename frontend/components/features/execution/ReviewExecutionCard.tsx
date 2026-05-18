"use client";

import type { ReviewStateDto } from "@/lib/runtime/execution/execution-types";
import { MessageSquareWarning } from "lucide-react";

export function ReviewExecutionCard({ review }: { review: ReviewStateDto }) {
  const hasReview =
    review.status !== "none" ||
    review.rejectionReason ||
    review.reviewerHint;

  if (!hasReview) return null;

  return (
    <div className="space-y-1.5 rounded-md border border-border/50 bg-background/25 p-2">
      <div className="flex items-center gap-2 text-xs font-medium">
        <MessageSquareWarning className="size-3.5 text-amber-300/90" />
        Review · {review.status}
      </div>
      {review.reviewerHint ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {review.reviewerHint}
        </p>
      ) : null}
      {review.rejectionReason ? (
        <p className="text-[11px] leading-snug text-sb-failed/90">
          Rejeição: {review.rejectionReason}
        </p>
      ) : null}
      {review.decidedAt ? (
        <p className="font-mono text-[10px] text-muted-foreground">
          {review.decidedAt}
        </p>
      ) : null}
    </div>
  );
}
