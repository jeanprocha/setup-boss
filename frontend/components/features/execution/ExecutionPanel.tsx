"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/primitives/EmptyState";
import { LoadingState } from "@/components/primitives/LoadingState";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { Surface } from "@/components/primitives/Surface";
import { BlockerList } from "@/components/features/execution/BlockerList";
import { ExecutionCorrelationStrip } from "@/components/features/execution/ExecutionCorrelationStrip";
import { ExecutionProgressCard } from "@/components/features/execution/ExecutionProgressCard";
import { ExecutionStateBadge } from "@/components/features/execution/ExecutionStateBadge";
import { RetryRecoveryCard } from "@/components/features/execution/RetryRecoveryCard";
import { ReviewCorrectionCard } from "@/components/features/execution/ReviewCorrectionCard";
import { SubtaskExecutionList } from "@/components/features/execution/SubtaskExecutionList";
import { useExecution } from "@/hooks/use-execution";
import { useRunEvents } from "@/hooks/use-run-events";
import { useRuntimeStallVisual } from "@/hooks/use-runtime-stall-visual";
import { deriveRunOperationalCoherence } from "@/lib/runtime/observability/derive-run-operational-coherence";
import { useRuntimeHeartbeatSnapshot } from "@/hooks/use-runtime-heartbeat";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ExecutionCorrelationTarget } from "@/lib/runtime/execution/execution-types";
import {
  seedExecutionAuditForRun,
  useExecutionAuditStore,
} from "@/stores/execution-audit-store";
import { OrchestrationRunControls } from "@/components/features/orchestration/OrchestrationRunControls";
import { Cog, Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";

export function ExecutionPanel({
  summary,
  projectId,
  onCorrelate,
}: {
  summary: RunSummaryDto;
  projectId?: string | null;
  onCorrelate?: (target: ExecutionCorrelationTarget) => void;
}) {
  const runKey = summary.runId ?? summary.id;
  const {
    bundle,
    applies,
    availability,
    activeSubtask,
    correlation,
    isLoading,
    lifecyclePhase,
    source,
  } = useExecution(runKey, summary.phase, summary.state);

  const { events } = useRunEvents(projectId ?? summary.projectId ?? null, runKey);
  const { heartbeat } = useRuntimeHeartbeatSnapshot();
  const coherence = useMemo(
    () =>
      deriveRunOperationalCoherence({
        summary,
        strategy: null,
        clarification: null,
        executionLifecyclePhase: lifecyclePhase,
        uiExecutionProcessing: true,
        heartbeat,
      }),
    [summary, lifecyclePhase, heartbeat],
  );
  const executionActive = coherence.showExecutionProcessing;
  const stall = useRuntimeStallVisual({
    events,
    uiActivelyProcessing: executionActive,
    executionLifecyclePhase: lifecyclePhase,
    runState: summary.state,
    runKey,
    tick: executionActive,
  });

  useEffect(() => {
    if (!bundle || bundle.summary.source === "unsupported") return;
    const hasForRun = useExecutionAuditStore.getState().entries.some(
      (e) => e.runId === runKey || e.jobId === summary.id,
    );
    if (hasForRun) return;
    seedExecutionAuditForRun(runKey, summary.id, {
      lifecyclePhase: bundle.summary.lifecycle.phase,
      review: bundle.summary.review,
      retry: bundle.summary.retry,
      correction: bundle.summary.correction,
      recovery: bundle.summary.recovery,
      blockers: bundle.summary.blockers,
    });
  }, [bundle, runKey, summary.id]);

  if (!applies) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <OrchestrationRunControls
          summary={summary}
          projectId={projectId ?? summary.projectId}
        />
        <EmptyState
          icon={Cog}
          title="Execução não activa"
          hint="Aprove clarificação e strategy; depois use Execute Run para iniciar orchestration."
          className="rounded-md border border-dashed border-border/60 py-10"
        />
      </div>
    );
  }

  if (isLoading && !bundle) {
    return <LoadingState />;
  }

  if (!bundle || bundle.summary.source === "unsupported") {
    return (
      <EmptyState
        icon={Cog}
        title="Execução indisponível"
        hint={
          bundle?.summary.unsupportedReason ??
          "Sem read-model de execução (API 404 ou corrida fora de escopo)."
        }
        className="rounded-md border border-dashed border-border/60 py-10"
      />
    );
  }

  const { summary: exec } = bundle;
  const degraded =
    availability.degraded ||
    exec.health === "degraded" ||
    exec.health === "partial";

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2"
      data-runtime-focus="execution-primary"
    >
      <SectionHeader
        title="Execution Runtime"
        description="Lifecycle operacional · subtasks · review · retry · recovery"
        action={
          <div className="flex items-center gap-2">
            {source ? (
              <Badge variant="secondary" className="font-mono text-[9px]">
                {source}
              </Badge>
            ) : null}
            <ExecutionStateBadge phase={lifecyclePhase} />
          </div>
        }
      />

      {availability.blockedReason ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">
          {availability.blockedReason}
        </p>
      ) : null}

      <OrchestrationRunControls
        summary={summary}
        projectId={projectId ?? summary.projectId}
        compact
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 pr-2">
          <ExecutionProgressCard
            label={exec.label}
            health={exec.health}
            progress={exec.progress}
            activeSubtask={activeSubtask}
            degraded={degraded}
            stallMessage={stall.message}
            stallLevel={stall.level}
          />

          {exec.blockers.length > 0 ? (
            <Surface variant="inset" className="space-y-1 p-3">
              <p className="text-[10px] font-semibold uppercase text-sb-warning">
                Bloqueios
              </p>
              <BlockerList blockers={exec.blockers} />
            </Surface>
          ) : null}

          <ReviewCorrectionCard
            review={exec.review}
            correction={exec.correction}
          />
          <RetryRecoveryCard retry={exec.retry} recovery={exec.recovery} />

          <Surface variant="inset" className="p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Subtasks · ordem de execução
            </p>
            <SubtaskExecutionList
              subtasks={bundle.subtasks}
              activeId={exec.lifecycle.currentSubtaskId}
            />
          </Surface>

          <Surface variant="inset" className="space-y-2 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Correlacionar evidência
            </p>
            <ExecutionCorrelationStrip
              links={correlation}
              onNavigate={onCorrelate}
            />
            <p className="text-[10px] text-muted-foreground">
              execution → timeline / stream → diagnostics → artefactos
            </p>
          </Surface>

          {degraded ? (
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Estado preservado · origem {source ?? "desconhecida"}
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
