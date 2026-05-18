"use client";

import { EmptyState } from "@/components/primitives/EmptyState";
import { RefinedPlanReview } from "@/components/features/clarification/RefinedPlanReview";
import type { RefinementPreviewDto } from "@/lib/runtime/clarification/clarification-types";
import { FileText } from "lucide-react";

export function RefinementPreview({
  refinement,
  isRefining,
}: {
  refinement: RefinementPreviewDto;
  isRefining?: boolean;
}) {
  if (isRefining && !refinement.available) {
    return (
      <EmptyState
        icon={FileText}
        title="A gerar refinement…"
        hint="Runtime a consolidar plano refinado após respostas."
        className="rounded-md border border-dashed border-border/60 py-6"
      />
    );
  }

  if (!refinement.available) {
    return null;
  }

  return <RefinedPlanReview refinement={refinement} />;
}
