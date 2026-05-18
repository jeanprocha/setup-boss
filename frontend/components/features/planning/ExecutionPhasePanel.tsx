"use client";

import { useEffect, useMemo } from "react";
import { formatExecutionAutoStartBlockMessage } from "@/lib/runtime/execution/execution-auto-start-block-message";
import {
  executionAutoStartInProgress,
  isExecutionAutoStartBlocked,
} from "@/lib/runtime/execution/execution-auto-start-policy";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
} from "lucide-react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import {
  deriveExecutionOperationalStatus,
  deriveExecutionOperationalSteps,
  labelExecutionOperationalStatus,
  labelSubtaskStateForUser,
  selectMaterializedMiniActivities,
  selectOperationalMiniTasks,
  type ExecutionOperationalStep,
} from "@/lib/runtime/operational/execution-operational-state";
import { useExecution } from "@/hooks/use-execution";
import { useOrchestration } from "@/hooks/use-orchestration";
import { useOrchestrationMutations } from "@/hooks/use-orchestration-mutations";
import { useRunSummary } from "@/hooks/use-run-summary";
import { useRunEvents } from "@/hooks/use-run-events";
import { useRuntimeStallVisual } from "@/hooks/use-runtime-stall-visual";
import { deriveRunOperationalCoherence } from "@/lib/runtime/observability/derive-run-operational-coherence";
import { useRuntimeHeartbeatSnapshot } from "@/hooks/use-runtime-heartbeat";
import { ExecutionProgressStrip } from "@/components/features/execution/ExecutionProgressStrip";
import { ExecutionMiniActivityTimeline } from "@/components/features/execution/ExecutionMiniActivityTimeline";
import {
  isOrchestrationActive,
  orchestrationGuardMessage,
} from "@/lib/runtime/orchestration/orchestration-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExecutionAutoStart } from "@/hooks/use-execution-auto-start";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import {
  operationalPhaseLabelForUi,
  operationalPhaseSubheadline,
} from "@/lib/runtime/operational/operational-ux-selectors";

function StepIcon({
  state,
}: {
  state: ExecutionOperationalStep["state"];
}) {
  if (state === "active") {
    return <Loader2 className="size-3.5 animate-spin text-primary" />;
  }
  if (state === "done") {
    return <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
  }
  if (state === "failed") {
    return <AlertCircle className="size-3.5 text-destructive" />;
  }
  return <Circle className="size-3.5 text-muted-foreground/50" />;
}

function ExecutionStepsRail({ steps }: { steps: ExecutionOperationalStep[] }) {
  return (
    <ol className="flex flex-col gap-1 border-l border-border/60 pl-3">
      {steps.map((step) => (
        <li
          key={step.id}
          className={cn(
            "flex items-center gap-2 text-[11px]",
            step.state === "active"
              ? "font-medium text-foreground"
              : "text-muted-foreground",
            step.state === "done" && "text-foreground/75",
          )}
        >
          <StepIcon state={step.state} />
          <span>{step.labelPt}</span>
        </li>
      ))}
    </ol>
  );
}

export function ExecutionPhasePanel({
  projectId,
  summary,
  operationalUx,
}: {
  projectId: string | null;
  summary: RunSummaryDto;
  operationalUx: RunOperationalUxContract;
}) {
  const runKey = summary.runId ?? summary.id;
  const liveSummary = useRunSummary(projectId, runKey) ?? summary;

  const orch = useOrchestration(liveSummary, runKey, { projectId });
  const execution = useExecution(runKey, liveSummary.phase, liveSummary.state);
  const mutations = useOrchestrationMutations({
    runKey,
    projectId,
    availability: orch.availability,
  });

  const { autoStartEligible, autoStartFailed, retryAutoStart } = useExecutionAutoStart({
    runKey,
    projectId,
    summary: liveSummary,
    lifecyclePhase: execution.lifecyclePhase,
    orchestrationState: orch.orchestrationState,
    availability: orch.availability,
    executeRun: mutations.executeRun,
  });

  const autoStartBlocked = isExecutionAutoStartBlocked(
    liveSummary,
    execution.lifecyclePhase,
    orch.orchestrationState,
    {
      canExecute: orch.availability.canExecute,
      jobStatus: liveSummary.jobStatus,
    },
  );

  const autoStartBlockMessage = useMemo(
    () =>
      autoStartBlocked
        ? formatExecutionAutoStartBlockMessage({
            availability: orch.availability,
            git: liveSummary.git,
          })
        : null,
    [autoStartBlocked, orch.availability, liveSummary.git],
  );

  const autoStartActive = executionAutoStartInProgress(
    liveSummary,
    execution.lifecyclePhase,
    orch.orchestrationState,
    {
      executePending: mutations.executeRun.isPending,
      jobStatus: liveSummary.jobStatus,
      autoStartFailed,
      canExecute: orch.availability.canExecute,
    },
  );

  const { events } = useRunEvents(projectId, runKey);
  const { heartbeat } = useRuntimeHeartbeatSnapshot();
  const coherence = useMemo(
    () =>
      deriveRunOperationalCoherence({
        summary: liveSummary,
        strategy: null,
        clarification: null,
        executionLifecyclePhase: execution.lifecyclePhase,
        uiExecutionProcessing: true,
        heartbeat,
      }),
    [liveSummary, execution.lifecyclePhase, heartbeat],
  );

  const executionActive = coherence.showExecutionProcessing;
  const stall = useRuntimeStallVisual({
    events,
    uiActivelyProcessing: executionActive,
    executionLifecyclePhase: execution.lifecyclePhase,
    runState: liveSummary.state,
    runKey,
    tick: executionActive,
  });

  const status = deriveExecutionOperationalStatus({
    lifecyclePhase: execution.lifecyclePhase,
    orchestrationState: orch.orchestrationState,
    executePending: mutations.executeRun.isPending,
    jobStatus: liveSummary.jobStatus,
  });

  const statusLabel = labelExecutionOperationalStatus(status);

  const materialized = execution.bundle?.materializedExecution ?? null;
  const useMaterialized =
    materialized != null &&
    !materialized.legacy &&
    materialized.miniActivities.length > 0;

  const subtasks = useMemo(
    () =>
      execution.bundle && !useMaterialized
        ? selectOperationalMiniTasks(execution.bundle.subtasks)
        : [],
    [execution.bundle, useMaterialized],
  );

  const miniActivities = useMemo(
    () =>
      useMaterialized && materialized
        ? selectMaterializedMiniActivities(materialized.miniActivities)
        : [],
    [useMaterialized, materialized],
  );

  const steps = useMemo(
    () =>
      deriveExecutionOperationalSteps({
        status,
        lifecyclePhase: execution.lifecyclePhase,
        hasSubtasks: subtasks.length > 0 || miniActivities.length > 0,
      }),
    [status, execution.lifecyclePhase, subtasks.length, miniActivities.length],
  );

  const progress = execution.bundle?.summary.progress ?? null;
  const activeSubtaskId =
    execution.bundle?.summary.lifecycle.currentSubtaskId ?? null;
  const activeMiniActivityId = materialized?.currentMiniActivityId ?? null;

  const orchestrationActive = isOrchestrationActive(orch.orchestrationState);
  const shouldPoll =
    orchestrationActive ||
    status === "starting" ||
    status === "running" ||
    status === "validating" ||
    status === "adjusting" ||
    status === "checkpoint";

  useEffect(() => {
    if (!shouldPoll) return;
    const id = window.setInterval(() => {
      void execution.refetch();
    }, 4000);
    return () => window.clearInterval(id);
  }, [shouldPoll, execution.refetch]);

  const showManualStart =
    status === "awaiting_start" && !autoStartEligible && !autoStartActive;

  const canStart =
    showManualStart &&
    orch.availability.canExecute &&
    !mutations.executeRun.isPending;

  const executeHint =
    orch.availability.message ??
    orchestrationGuardMessage(orch.availability.reason) ??
    null;

  const executeError =
    mutations.executeRun.error instanceof Error
      ? mutations.executeRun.error.message
      : null;

  const showProgress =
    status !== "awaiting_start" && progress && progress.total > 0;

  const phaseTitle = operationalPhaseLabelForUi(operationalUx);
  const phaseSubheadline = operationalPhaseSubheadline(operationalUx, {
    executionLifecyclePhase: execution.lifecyclePhase,
  });

  return (
    <section
      className="mx-auto w-full max-w-2xl space-y-4 py-2"
      aria-label={phaseTitle}
    >
      <header className="space-y-1">
        <p className="cs-text-caption font-medium uppercase tracking-wide text-muted-foreground">
          Fase operacional
        </p>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {phaseTitle}
        </h2>
        <p className="text-sm text-muted-foreground" role="status">
          {phaseSubheadline || statusLabel}
        </p>
      </header>

      <ExecutionStepsRail steps={steps} />

      <p className="text-[12px] leading-relaxed text-muted-foreground">
        A execuÃ§Ã£o aplica o plano aprovado no workspace preparado. O progresso
        reflecte o estado real da atividade.
        {autoStartActive
          ? " A execuÃ§Ã£o arranca automaticamente apÃ³s o versionamento."
          : ""}
      </p>

      {status === "awaiting_start" && autoStartBlocked && autoStartBlockMessage ? (
        <div
          className="space-y-2 rounded-lg border border-amber-600/35 bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-950 dark:text-amber-50"
          role="alert"
        >
          <p className="font-medium">{autoStartBlockMessage.headline}</p>
          <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-100/90">
            {autoStartBlockMessage.body}
          </pre>
        </div>
      ) : null}

      {status === "awaiting_start" && autoStartActive ? (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          A iniciar execuÃ§Ã£o automaticamenteâ€¦
        </div>
      ) : null}

      {showManualStart ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground">
          Workspace operacional pronto. Confirme quando quiser iniciar a
          execuÃ§Ã£o.
        </div>
      ) : null}

      {status === "completed" ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-3 py-2.5">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-900 dark:text-emerald-100">
            ExecuÃ§Ã£o concluÃ­da. As alteraÃ§Ãµes foram aplicadas conforme o plano
            aprovado.
          </p>
        </div>
      ) : null}

      {showManualStart ? (
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5 text-[12px] font-medium"
          disabled={!canStart}
          onClick={() => mutations.executeRun.mutate()}
          title={!canStart ? executeHint ?? undefined : undefined}
        >
          {mutations.executeRun.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          Iniciar execuÃ§Ã£o
        </Button>
      ) : null}

      {autoStartFailed && status === "awaiting_start" ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-9 gap-1.5 text-[12px] font-medium"
          disabled={!orch.availability.canExecute || mutations.executeRun.isPending}
          onClick={() => retryAutoStart()}
        >
          {mutations.executeRun.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          Tentar novamente
        </Button>
      ) : null}

      {executeHint &&
      status === "awaiting_start" &&
      !canStart &&
      !autoStartActive &&
      !autoStartBlocked ? (
        <p className="text-[11px] text-muted-foreground">{executeHint}</p>
      ) : null}

      {executeError ? (
        <p className="text-[11px] text-destructive" role="alert">
          {executeError}
        </p>
      ) : null}

      {showProgress && progress ? (
        <div className="space-y-2 rounded-xl border border-border/70 bg-card/80 px-3.5 py-3 shadow-sm">
          <p className="text-xs font-semibold text-foreground">Progresso</p>
          <ExecutionProgressStrip progress={progress} />
          {execution.activeSubtask ? (
            <p className="text-[11px] text-muted-foreground">
              Etapa actual:{" "}
              <span className="font-medium text-foreground">
                {execution.activeSubtask.title}
              </span>
            </p>
          ) : null}
          {stall.message ? (
            <p className="text-[10px] text-muted-foreground">{stall.message}</p>
          ) : null}
        </div>
      ) : null}

      {status !== "awaiting_start" && execution.isLoading && !execution.bundle ? (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          A carregar progressoâ€¦
        </p>
      ) : null}

      {useMaterialized ? (
        <ExecutionMiniActivityTimeline
          miniActivities={miniActivities}
          activeMiniActivityId={activeMiniActivityId}
          orderingMode={materialized?.orderingMode}
        />
      ) : subtasks.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-border/70 bg-card/80 px-3.5 py-3 shadow-sm">
          <p className="text-xs font-semibold text-foreground">Mini-tarefas</p>
          <ul className="space-y-1.5">
            {subtasks.map((st) => {
              const isActive = st.id === activeSubtaskId;
              return (
                <li
                  key={st.id}
                  className={cn(
                    "flex items-start justify-between gap-2 rounded-md border border-border/40 bg-muted/15 px-2.5 py-2 text-[11px]",
                    isActive && "border-primary/40 ring-1 ring-primary/20",
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground/90">
                      <span className="text-muted-foreground">#{st.order}</span>{" "}
                      {st.title}
                    </p>
                    {st.blockerLabel ? (
                      <p className="mt-1 text-destructive">{st.blockerLabel}</p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      st.state === "completed"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : st.state === "failed" || st.state === "blocked"
                          ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                          : isActive
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                    )}
                  >
                    {labelSubtaskStateForUser(st.state)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : status !== "awaiting_start" ? (
        <p className="text-[11px] text-muted-foreground">
          Nenhuma mini-tarefa registada para esta atividade.
        </p>
      ) : null}

      {status === "blocked" || status === "failed" ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
          <AlertCircle className="size-4 text-destructive" />
          <p className="text-sm text-destructive">{statusLabel}</p>
        </div>
      ) : null}

      {(execution.bundle?.summary.blockers.length ?? 0) > 0 ? (
        <ul className="space-y-1 text-[11px] text-amber-800 dark:text-amber-100">
          {execution.bundle!.summary.blockers.map((b) => (
            <li key={b.id}>{b.label}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
