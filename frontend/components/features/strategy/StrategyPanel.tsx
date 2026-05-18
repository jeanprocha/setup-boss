"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/primitives/EmptyState";
import { LoadingState } from "@/components/primitives/LoadingState";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { Surface } from "@/components/primitives/Surface";
import { AIRecommendationCard } from "@/components/features/strategy/AIRecommendationCard";
import { ComplexityCard } from "@/components/features/strategy/ComplexityCard";
import { ExecutionOrderingView } from "@/components/features/strategy/ExecutionOrderingView";
import { SharedContextView } from "@/components/features/strategy/SharedContextView";
import { StrategyStateBadge } from "@/components/features/strategy/StrategyStateBadge";
import { SubtaskStrategyTree } from "@/components/features/strategy/SubtaskStrategyTree";
import { useStrategy } from "@/hooks/use-strategy";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import {
  complexityLevelLabel,
  recommendationModeLabel,
} from "@/lib/runtime/strategy/strategy-state";
import { cn } from "@/lib/utils";
import { GitBranch, Loader2, Map } from "lucide-react";
import { useEffect } from "react";
import {
  seedStrategyAuditForRun,
  useStrategyAuditStore,
} from "@/stores/strategy-audit-store";

const riskTone = {
  low: "border-border bg-muted/30 text-muted-foreground",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  high: "border-sb-failed/40 bg-sb-failed/10 text-sb-failed",
} as const;

const readinessTone = {
  not_ready: "text-sb-failed",
  partial: "text-amber-200",
  ready: "text-emerald-300",
} as const;

export function StrategyPanel({ summary }: { summary: RunSummaryDto }) {
  const runKey = summary.runId ?? summary.id;
  const {
    bundle,
    applies,
    availability,
    treeRows,
    criticalRisks,
    orderingHighlights,
    isPending,
    isFetching,
    source,
    runtimePhase,
  } = useStrategy(runKey, summary.phase, summary.state);

  useEffect(() => {
    if (!bundle || bundle.summary.source === "unsupported") return;
    const hasForRun = useStrategyAuditStore.getState().entries.some(
      (e) => e.runId === runKey || e.jobId === summary.id,
    );
    if (hasForRun) return;
    seedStrategyAuditForRun(runKey, summary.id, bundle.summary.runtimePhase);
  }, [bundle, runKey, summary.id]);

  if (!applies) {
    return (
      <EmptyState
        icon={Map}
        title="Strategy não activa"
        hint="Esta corrida ainda não está em fase de planeamento de execução."
        className="rounded-md border border-dashed border-border/60 py-10"
      />
    );
  }

  if (isPending && !bundle) {
    return <LoadingState />;
  }

  if (!bundle || bundle.summary.source === "unsupported") {
    return (
      <EmptyState
        icon={Map}
        title="Strategy indisponível"
        hint={
          bundle?.summary.unsupportedReason ??
          "Sem read-model strategy (API 404 ou corrida fora de escopo)."
        }
        className="rounded-md border border-dashed border-border/60 py-10"
      />
    );
  }

  const degraded = availability.degraded || bundle.summary.source === "partial";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <SectionHeader
        title="Strategy Runtime"
        description="Planeamento operacional · decomposição · ordering · readiness"
        action={
          <div className="flex items-center gap-2">
            {isFetching ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : null}
            <StrategyStateBadge phase={runtimePhase} />
          </div>
        }
      />

      {degraded || availability.blockedReason ? (
        <Surface variant="strip" className="border-amber-500/30 px-3 py-2 text-[11px] text-amber-100">
          {availability.blockedReason ?? "Dados strategy degradados — validar origem."}
          {source ? (
            <Badge variant="outline" className="ml-2 font-mono text-[9px]">
              {source}
            </Badge>
          ) : null}
        </Surface>
      ) : source ? (
        <p className="font-mono text-[10px] text-muted-foreground">
          origem: {source}
        </p>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 pb-2 lg:grid-cols-2">
          <ComplexityCard complexity={bundle.complexity} />
          <AIRecommendationCard recommendation={bundle.recommendation} />

          <Surface variant="inset" className="space-y-2 p-3 lg:col-span-2">
            <ReadinessStrip bundle={bundle} orderingHighlights={orderingHighlights} />
            {bundle.decompositionSummary ? (
              <p className="text-[11px] leading-snug text-muted-foreground">
                {bundle.decompositionSummary}
              </p>
            ) : null}
          </Surface>

          <Surface variant="inset" className="space-y-2 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <GitBranch className="size-3.5" aria-hidden />
              Subtasks ({bundle.summary.subtaskCount})
            </div>
            <SubtaskStrategyTree rows={treeRows} />
          </Surface>

          <Surface variant="inset" className="p-3">
            <ExecutionOrderingView ordering={bundle.ordering} />
          </Surface>

          <Surface variant="inset" className="p-3 lg:col-span-2">
            <SharedContextView context={bundle.sharedContext} />
          </Surface>

          {criticalRisks.length > 0 ? (
            <Surface variant="inset" className="space-y-2 p-3 lg:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Riscos críticos
              </p>
              <ul className="space-y-1">
                {criticalRisks.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px]",
                      riskTone[r.level],
                    )}
                  >
                    <span className="font-mono text-[10px] uppercase opacity-80">
                      {r.level}
                    </span>{" "}
                    {r.label}
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function ReadinessStrip({
  bundle,
  orderingHighlights,
}: {
  bundle: NonNullable<ReturnType<typeof useStrategy>["bundle"]>;
  orderingHighlights: ReturnType<typeof useStrategy>["orderingHighlights"];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="text-muted-foreground">Readiness</span>
      <span
        className={cn(
          "font-semibold uppercase",
          readinessTone[
            bundle.summary.operationalReadiness as keyof typeof readinessTone
          ],
        )}
      >
        {bundle.summary.operationalReadiness}
      </span>
      <Badge variant="secondary" className="text-[10px]">
        {bundle.summary.readySubtaskCount}/{bundle.summary.subtaskCount} ready
      </Badge>
      <Badge variant="secondary" className="text-[10px]">
        {complexityLevelLabel(bundle.complexity.level)}
      </Badge>
      <Badge variant="secondary" className="text-[10px]">
        {recommendationModeLabel(bundle.recommendation.recommendedMode)}
      </Badge>
      {orderingHighlights?.firstReady ? (
        <span className="font-mono text-[10px] text-muted-foreground">
          primeiro: {orderingHighlights.firstReady}
        </span>
      ) : null}
    </div>
  );
}
