"use client";

import { Surface } from "@/components/primitives/Surface";
import type { ComplexityDto } from "@/lib/runtime/strategy/strategy-types";
import { complexityLevelLabel } from "@/lib/runtime/strategy/strategy-state";
import { cn } from "@/lib/utils";
import { Gauge } from "lucide-react";

const levelTone: Record<ComplexityDto["level"], string> = {
  low: "text-emerald-300",
  medium: "text-cyan-200",
  high: "text-amber-200",
  expert: "text-rose-200",
};

const riskTone = {
  low: "bg-emerald-500/15 text-emerald-100",
  medium: "bg-amber-500/15 text-amber-100",
  high: "bg-rose-500/15 text-rose-100",
} as const;

export function ComplexityCard({ complexity }: { complexity: ComplexityDto }) {
  return (
    <Surface variant="inset" className="space-y-2 p-3">
      <CardHeader title="Complexidade" level={complexity.level} />
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Metric label="Dificuldade" value={complexity.estimatedDifficulty} />
        <Metric
          label="Risco exec."
          value={complexity.executionRisk}
          tone={riskTone[complexity.executionRisk]}
        />
        <Metric label="Carga runtime" value={complexity.runtimeLoad} />
        <Metric label="Coordenação" value={complexity.coordinationComplexity} />
      </div>
      {complexity.rationale ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {complexity.rationale}
        </p>
      ) : null}
    </Surface>
  );
}

function CardHeader({
  title,
  level,
}: {
  title: string;
  level: ComplexityDto["level"];
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Gauge className="size-3.5 text-cyan-300/80" aria-hidden />
        {title}
      </span>
      <span
        className={cn(
          "font-mono text-[11px] font-semibold uppercase",
          levelTone[level],
        )}
      >
        {complexityLevelLabel(level)}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-sm border border-border/50 bg-background/25 px-2 py-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-[11px] capitalize text-foreground/90",
          tone,
        )}
      >
        {value}
      </p>
    </div>
  );
}
