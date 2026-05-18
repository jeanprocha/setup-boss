"use client";

import { Surface } from "@/components/primitives/Surface";
import type { AIRecommendationDto } from "@/lib/runtime/strategy/strategy-types";
import { recommendationModeLabel } from "@/lib/runtime/strategy/strategy-state";
import { Sparkles } from "lucide-react";

export function AIRecommendationCard({
  recommendation,
}: {
  recommendation: AIRecommendationDto;
}) {
  return (
    <Surface variant="inset" className="space-y-2 p-3">
      <CardHeader mode={recommendation.recommendedMode} />
      <dl className="space-y-1.5 text-[11px]">
        <Row label="Modelo" value={recommendation.modelStrategy} />
        <Row label="Abordagem" value={recommendation.executionApproach} />
        <Row label="Impacto" value={recommendation.operationalImpact} />
      </dl>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {recommendation.rationale}
      </p>
      {recommendation.costPerformanceHint ? (
        <p className="font-mono text-[10px] text-muted-foreground/90">
          {recommendation.costPerformanceHint}
        </p>
      ) : null}
    </Surface>
  );
}

function CardHeader({ mode }: { mode: AIRecommendationDto["recommendedMode"] }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Sparkles className="size-3.5 text-violet-300/90" aria-hidden />
        Recomendação IA
      </span>
      <span className="rounded-md border border-violet-500/35 bg-violet-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-violet-100">
        {recommendationModeLabel(mode)}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 leading-snug text-foreground/90">{value}</dd>
    </div>
  );
}
