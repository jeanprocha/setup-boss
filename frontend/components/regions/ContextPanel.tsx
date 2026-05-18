"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { StatusBadge } from "@/components/primitives/StatusBadge";
import { Surface } from "@/components/primitives/Surface";
import { EmptyState } from "@/components/primitives/EmptyState";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { useProjects } from "@/hooks/use-projects";
import { useRunSummary } from "@/hooks/use-run-summary";
import { useRunEvents } from "@/hooks/use-run-events";
import { useRunOperational } from "@/hooks/use-run-operational";
import { useClarification } from "@/hooks/use-clarification";
import { useExecution } from "@/hooks/use-execution";
import { useStrategy } from "@/hooks/use-strategy";
import { ClarificationStateBadge } from "@/components/features/clarification/ClarificationStateBadge";
import { ExecutionStateBadge } from "@/components/features/execution/ExecutionStateBadge";
import { StrategyStateBadge } from "@/components/features/strategy/StrategyStateBadge";
import {
  complexityLevelLabel,
  recommendationModeLabel,
} from "@/lib/runtime/strategy/strategy-state";
import { executionHealthLabel } from "@/lib/runtime/execution/execution-state";
import {
  integrityBadgeClass,
  integrityStateLabel,
  runPhaseDisplayLabel,
} from "@/lib/runtime/adapters/runtime-labels";
import { Cpu, Gauge, Sparkles, Layers, Inbox } from "lucide-react";

export function ContextPanel() {
  const selectedProjectId = useMissionShellStore((s) => s.selectedProjectId);
  const selectedRunId = useMissionShellStore((s) => s.selectedRunId);

  const pq = useProjects();
  const summary = useRunSummary(selectedProjectId, selectedRunId);

  const project = pq.data?.projects.find((p) => p.id === selectedProjectId);
  const headerState = summary?.state ?? "running";
  const runLive = summary;

  const degraded = useRuntimeConnectionStore((s) => s.connection.degraded);
  const { events: runScopedEvents } = useRunEvents(
    selectedProjectId,
    selectedRunId,
  );
  const operational = useRunOperational(runLive, runScopedEvents, degraded);

  const clarifyRunKey =
    runLive?.runId ?? runLive?.id ?? selectedRunId ?? null;
  const clarify = useClarification(
    clarifyRunKey,
    runLive?.phase,
    runLive?.state,
  );
  const execution = useExecution(
    clarifyRunKey,
    runLive?.phase,
    runLive?.state,
  );
  const strategy = useStrategy(
    clarifyRunKey,
    runLive?.phase,
    runLive?.state,
  );

  return (
    <aside className="flex w-[min(100%,22rem)] shrink-0 flex-col border-l border-border bg-card/25">
      <SectionHeader
        title="Contexto da corrida"
        description="Resumo derivado da Runtime API (read-only, sem paths internos)."
        action={<StatusBadge state={headerState} className="max-w-[7rem]" />}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          <Surface variant="strip" className="p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="size-4 text-sidebar-primary" />
              Projecto
            </div>
            <p className="mt-1 text-[13px] font-medium">
              {project?.displayName ?? "â€”"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {project?.subtitle ?? "â€”"}
            </p>
            <Badge variant="secondary" className="mt-2 text-[10px]">
              id:{" "}
              <span className="font-mono">{project?.id ?? "â€”"}</span>
            </Badge>
          </Surface>

          {execution.bundle && execution.applies ? (
            <Surface variant="inset" className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  ExecuÃ§Ã£o
                </span>
                <ExecutionStateBadge phase={execution.lifecyclePhase} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {executionHealthLabel(execution.bundle.summary.health)} Â·{" "}
                {execution.bundle.summary.progress.completed}/
                {execution.bundle.summary.progress.total} subtasks
              </p>
              {execution.activeSubtask ? (
                <p className="line-clamp-2 font-mono text-[10px] text-foreground/85">
                  activa Â· {execution.activeSubtask.title}
                </p>
              ) : null}
              {execution.bundle.summary.retry.count > 0 ? (
                <p className="font-mono text-[10px] text-muted-foreground">
                  retry {execution.bundle.summary.retry.count}/
                  {execution.bundle.summary.retry.maxAttempts}
                </p>
              ) : null}
              {execution.bundle.summary.correction.generation > 0 ? (
                <p className="font-mono text-[10px] text-muted-foreground">
                  correcÃ§Ã£o g{execution.bundle.summary.correction.generation}
                </p>
              ) : null}
              {execution.bundle.summary.blockers.length > 0 ? (
                <p className="text-[10px] text-sb-warning">
                  {execution.bundle.summary.blockers[0].label}
                </p>
              ) : null}
            </Surface>
          ) : null}

          {strategy.bundle && strategy.applies ? (
            <Surface variant="inset" className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  Strategy
                </span>
                <StrategyStateBadge phase={strategy.runtimePhase} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {strategy.bundle.summary.readySubtaskCount}/
                {strategy.bundle.summary.subtaskCount} ready Â·{" "}
                {complexityLevelLabel(strategy.bundle.complexity.level)} Â·{" "}
                {recommendationModeLabel(
                  strategy.bundle.recommendation.recommendedMode,
                )}
              </p>
              {strategy.contextHighlights?.topRisk ? (
                <p className="line-clamp-2 text-[10px] text-sb-warning">
                  {strategy.contextHighlights.topRisk}
                </p>
              ) : null}
              <p className="font-mono text-[10px] text-muted-foreground">
                readiness {strategy.bundle.summary.operationalReadiness}
                {strategy.source ? ` Â· ${strategy.source}` : ""}
              </p>
            </Surface>
          ) : null}

          {clarify.bundle && clarify.applies ? (
            <Surface variant="inset" className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  HITL Â· ClarificaÃ§Ã£o
                </span>
                <ClarificationStateBadge
                  phase={clarify.bundle.session.runtimePhase}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {clarify.bundle.session.pendingBlockingCount} blocking Â·{" "}
                {clarify.bundle.session.answersCount}/
                {clarify.bundle.session.questionsCount} respostas
              </p>
              {clarify.bundle.refinement.available ? (
                <p className="line-clamp-2 text-[11px] leading-snug text-foreground/85">
                  {clarify.bundle.refinement.refinedTask}
                </p>
              ) : null}
              {clarify.bundle.approval.status !== "none" ? (
                <p className="font-mono text-[10px] text-muted-foreground">
                  aprovaÃ§Ã£o: {clarify.bundle.approval.status}
                </p>
              ) : null}
            </Surface>
          ) : null}

          {runLive ? (
            <>
              {operational ? (
                <Surface variant="inset" className="space-y-2 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Gauge className="size-4 text-cyan-300/80" aria-hidden />
                    Sinal operacional
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      avisos {operational.warningsCount}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      erros {operational.errorsCount}
                    </Badge>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${integrityBadgeClass(operational.integrity)}`}
                    >
                      {integrityStateLabel(operational.integrity)}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Fase apresentada:{" "}
                    <span className="font-medium text-foreground/90">
                      {runPhaseDisplayLabel(runLive.phase)}
                    </span>
                    {" Â· "}
                    actualizado {operational.updatedAtLabel ?? "â€”"}
                  </p>
                </Surface>
              ) : null}
              <Surface className="p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Layers className="size-4 text-sidebar-primary" />
                  Job (API)
                </div>
                <p className="mt-1 font-mono text-[12px]">{runLive.label}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    job {runLive.id}
                  </Badge>
                  {runLive.runId ? (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      run {runLive.runId}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="text-[10px]">
                    fase {runLive.phase}
                  </Badge>
                </div>
              </Surface>
              {strategy.bundle && strategy.applies ? (
                <Surface className="p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="size-4 text-cyan-300/90" />
                    RecomendaÃ§Ã£o IA
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                    {strategy.bundle.recommendation.rationale}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {recommendationModeLabel(
                      strategy.bundle.recommendation.recommendedMode,
                    )}{" "}
                    Â· {strategy.bundle.recommendation.executionApproach}
                  </p>
                </Surface>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={Inbox}
              title="Sem corrida seleccionada"
              hint="Escolha um job na barra lateral para ver contexto operacional."
              className="py-10"
            />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
