"use client";

import { CentralColumnIdleGuide } from "@/components/features/run-detail/CentralColumnIdleGuide";
import { EmptyState } from "@/components/primitives/EmptyState";
import { LoadingState } from "@/components/primitives/LoadingState";
import { ExecutionFeed } from "@/components/features/execution-timeline/ExecutionFeed";
import { AddProjectDialog } from "@/components/features/projects/AddProjectDialog";
import { useAddProjectFlow } from "@/hooks/use-add-project-flow";
import { useRunEvents } from "@/hooks/use-run-events";
import { useRunOperational } from "@/hooks/use-run-operational";
import { useRunSummary } from "@/hooks/use-run-summary";
import { useRuns } from "@/hooks/use-runs";
import { useProjects } from "@/hooks/use-projects";
import { useCreateRun } from "@/hooks/use-create-run";
import { buildOperationalPipelineRows } from "@/lib/runtime/execution/derive-operational-pipeline";
import { resolveOperationalHeadline } from "@/lib/runtime/adapters/dynamic-activity-steps";
import { buildExecutionTimelineCards } from "@/lib/runtime/execution/build-execution-timeline-cards";
import { filterLiveOperationalPipelineRows } from "@/lib/runtime/execution/filter-live-execution-timeline";
import {
  buildSemanticExecutionTimeline,
  deriveSemanticTimelineHighlightIndex,
} from "@/lib/runtime/execution/semantic-workflow-mapper";
import { getExecutionStepDefinition } from "@/lib/runtime/execution/execution-step-catalog";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { InitializationPhasePanel } from "@/components/features/initialization/InitializationPhasePanel";
import { OperationalPhaseStack } from "@/components/features/run-detail/OperationalPhaseStack";
import { useOperationalReview } from "@/hooks/use-operational-review";
import { useOperationalFinalization } from "@/hooks/use-operational-finalization";
import { useIntakeStore } from "@/stores/intake-store";
import { useOrchestration } from "@/hooks/use-orchestration";
import { useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { Inbox, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef } from "react";
import {
  deriveAttentionHint,
  type MissionOrchestrationSlices,
} from "@/lib/runtime/mission/mission-workflow-stages";
import { OperationalUxPanel } from "@/components/features/run-detail/OperationalUxPanel";
import { useI18n } from "@/lib/i18n/use-i18n";
import { translateTimelinePhaseTitle } from "@/lib/i18n/timeline-phase-label";
import { useRunSelectionResync } from "@/hooks/use-run-selection-resync";
import { useWorkspaceRunDetail } from "@/hooks/use-workspace-run-detail";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { WorkspaceContextCard } from "@/components/features/workspace/WorkspaceContextCard";
import { WorkspaceOperationalPhasePanel } from "@/components/features/workspace/WorkspaceOperationalPhasePanel";
import { isWorkspaceRunOperationalPhase } from "@/lib/workspace/workspace-run-lifecycle";
import { parseWorkspaceGlobalSpec } from "@/lib/workspace/workspace-global-spec";
import { useClarificationMutations } from "@/hooks/use-clarification-mutations";
import { useGitBranchMutation } from "@/hooks/use-git-branch-mutation";
import { resolvedRunFetchKey } from "@/lib/runtime/run-selection";
export function RunViewShell() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const projectId = useMissionShellStore((s) => s.selectedProjectId);
  const runId = useMissionShellStore((s) => s.selectedRunId);
  const selectedWorkspaceRunId = useMissionShellStore((s) => s.selectedWorkspaceRunId);
  const selectedWorkspaceId = useMissionShellStore((s) => s.selectedWorkspaceId);
  const newActivityFlow = useMissionShellStore((s) => s.newActivityFlow);
  const setStepNavItems = useMissionShellStore((s) => s.setStepNavItems);
  const setTimelineNavHighlightIndex = useMissionShellStore(
    (s) => s.setTimelineNavHighlightIndex,
  );
  const { t, locale } = useI18n();

  const pq = useProjects();
  const workspacesQuery = useWorkspaces();
  const workspaceDetail = useWorkspaceRunDetail(selectedWorkspaceRunId);
  const workspaceRun = workspaceDetail.runQuery.data;
  const workspaceGit =
    workspaceDetail.gitQuery.isError
      ? workspaceRun?.git ?? null
      : workspaceDetail.gitQuery.data?.git ?? workspaceRun?.git ?? null;
  const workspaceOperational = Boolean(
    workspaceRun && isWorkspaceRunOperationalPhase(workspaceRun),
  );
  const workspace = useMemo(
    () =>
      (workspacesQuery.data?.workspaces ?? []).find(
        (w) => w.workspaceId === selectedWorkspaceId,
      ) ?? null,
    [workspacesQuery.data?.workspaces, selectedWorkspaceId],
  );
  const workspaceProjectIds = useMemo(() => {
    const spec = parseWorkspaceGlobalSpec(workspaceRun?.globalSpec ?? null);
    return spec?.projectIds?.length ? spec.projectIds : undefined;
  }, [workspaceRun?.globalSpec]);
  const rq = useRuns(projectId);
  const summary = useRunSummary(projectId, runId);
  const effectiveSummary = summary;
  const activeRunKey = resolvedRunFetchKey(effectiveSummary, runId);

  const { events } = useRunEvents(projectId, runId);
  const connection = useRuntimeConnectionStore((s) => s.connection);

  const runKeyForResync =
    effectiveSummary?.runId ?? effectiveSummary?.id ?? runId;
  useRunSelectionResync(runKeyForResync ?? null);

  const operational = useRunOperational(
    effectiveSummary,
    events,
    connection.degraded,
  );

  const orch = useOrchestration(effectiveSummary, activeRunKey, {
    projectId,
    newActivityFlow,
  });

  const runKeyForOperational = activeRunKey;
  const operationalReview = useOperationalReview(
    runKeyForOperational,
    effectiveSummary,
    orch.execution.lifecyclePhase ?? null,
  );
  const operationalFinalization = useOperationalFinalization(
    runKeyForOperational,
    operationalReview.hitl,
  );

  const missionOrch: MissionOrchestrationSlices = useMemo(
    () => ({
      clarification: {
        applies: orch.clarification.applies,
        bundle: orch.clarification.bundle,
      },
      strategy: {
        applies: orch.strategy.applies,
        bundle: orch.strategy.bundle,
      },
      execution: {
        applies: orch.execution.applies,
        lifecyclePhase: orch.execution.lifecyclePhase ?? null,
      },
    }),
    [
      orch.clarification.applies,
      orch.clarification.bundle,
      orch.strategy.applies,
      orch.strategy.bundle,
      orch.execution.applies,
      orch.execution.lifecyclePhase,
    ],
  );

  const projectList = pq.data?.projects;
  const projectCount = projectList?.length ?? 0;
  const projectsLoading = pq.isPending && projectCount === 0;

  const projectLabel = useMemo(() => {
    if (!projectId || !projectList) return null;
    const p = projectList.find((x) => x.id === projectId);
    return p?.displayName?.trim() || null;
  }, [projectList, projectId]);

  const pipelineRows = useMemo(
    () =>
      buildOperationalPipelineRows({
        runId,
        newActivityFlow,
        summary: effectiveSummary,
        events,
        clarificationRuntimePhase:
          orch.clarification.bundle?.session.runtimePhase ?? null,
        strategyRuntimePhase:
          orch.strategy.bundle?.summary.runtimePhase ?? null,
      }),
    [
      runId,
      newActivityFlow,
      effectiveSummary,
      events,
      orch.clarification.bundle?.session.runtimePhase,
      orch.strategy.bundle?.summary.runtimePhase,
    ],
  );

  const livePipelineRows = useMemo(
    () =>
      filterLiveOperationalPipelineRows(pipelineRows, {
        runId,
        newActivityFlow,
        summary: effectiveSummary,
        clarificationBundle: orch.clarification.bundle ?? null,
        strategyBundle: orch.strategy.bundle ?? null,
        executionBundle: orch.execution.bundle ?? null,
      }),
    [
      pipelineRows,
      runId,
      newActivityFlow,
      effectiveSummary,
      orch.clarification.bundle,
      orch.strategy.bundle,
      orch.execution.bundle,
    ],
  );

  const operationalHeadline = useMemo(
    () =>
      effectiveSummary
        ? resolveOperationalHeadline(
            effectiveSummary,
            orch.clarification.bundle?.session.runtimePhase ?? null,
            orch.strategy.bundle?.summary.runtimePhase ?? null,
          )
        : null,
    [
      effectiveSummary,
      orch.clarification.bundle?.session.runtimePhase,
      orch.strategy.bundle?.summary.runtimePhase,
    ],
  );

  const attentionHint = useMemo(
    () =>
      effectiveSummary
        ? deriveAttentionHint(effectiveSummary, missionOrch)
        : null,
    [effectiveSummary, missionOrch],
  );

  const centralCards = useMemo(
    () =>
      buildExecutionTimelineCards({
        rows: livePipelineRows,
        runId,
        projectId,
        projectLabel,
        newActivityFlow,
        summary: effectiveSummary,
        events,
        operational,
        clarificationApplies: orch.clarification.applies,
        strategyApplies: orch.strategy.applies,
        executionApplies: orch.execution.applies,
        clarificationBundle: orch.clarification.bundle ?? null,
        strategyBundle: orch.strategy.bundle ?? null,
        executionBundle: orch.execution.bundle ?? null,
        attentionHint,
        operationalHeadline,
      }),
    [
      livePipelineRows,
      runId,
      projectId,
      projectLabel,
      newActivityFlow,
      effectiveSummary,
      events,
      operational,
      orch.clarification.applies,
      orch.strategy.applies,
      orch.execution.applies,
      orch.clarification.bundle,
      orch.strategy.bundle,
      orch.execution.bundle,
      attentionHint,
      operationalHeadline,
    ],
  );

  const semanticCards = useMemo(
    () =>
      buildSemanticExecutionTimeline({
        cards: centralCards,
        rows: livePipelineRows,
        summary: effectiveSummary,
        clarificationBundle: orch.clarification.bundle ?? null,
        strategyBundle: orch.strategy.bundle ?? null,
        strategyPhase: orch.strategy.bundle?.summary.runtimePhase ?? null,
        dominantStrategyHandoff: false,
        executionPhase: orch.execution.bundle?.summary.lifecycle.phase ?? null,
      }),
    [
      centralCards,
      livePipelineRows,
      effectiveSummary,
      orch.clarification.bundle,
      orch.strategy.bundle,
      orch.execution.bundle?.summary.lifecycle.phase,
    ],
  );

  const create = useCreateRun();
  const createResult = create.data ?? null;
  const intakeUiPhase = useIntakeStore((s) => s.uiPhase);
  const composeOnlyInit = Boolean(newActivityFlow && !runId && projectId);
  const operationalPanelInput = {
    executionApplies: orch.execution.applies,
    isInitializationPhase: orch.operationalUx.isInitializationPhase,
    clarificationApplies: orch.clarification.applies,
    bundle: orch.clarification.bundle,
    operationalUx: orch.operationalUx,
  };
  const submissionBusy =
    create.isPending ||
    intakeUiPhase === "creating_run" ||
    intakeUiPhase === "intake_running";

  useEffect(() => {
    setTimelineNavHighlightIndex(
      deriveSemanticTimelineHighlightIndex(
        livePipelineRows,
        semanticCards,
        effectiveSummary,
      ),
    );
  }, [
    livePipelineRows,
    semanticCards,
    effectiveSummary,
    setTimelineNavHighlightIndex,
  ]);

  const stepNavItemsFromCards = useMemo(
    () =>
      semanticCards.map((c) => {
        const def = getExecutionStepDefinition(c.stepId);
        return {
          navKey: c.stepId,
          order: c.priority,
          scrollTargetId: c.anchorId,
          title: translateTimelinePhaseTitle(t, c.semanticPhaseId, c.title),
          shortDescription: def?.shortDescription ?? "",
          operationalStatus: c.status,
          iconName: def?.icon ?? "activity",
        };
      }),
    [semanticCards, locale, t],
  );

  useEffect(() => {
    setStepNavItems(stepNavItemsFromCards);
  }, [stepNavItemsFromCards, setStepNavItems]);

  useEffect(() => {
    return () => setStepNavItems([]);
  }, [runId, setStepNavItems]);

  const runsLoading =
    Boolean(projectId) && rq.isPending && rq.fetchStatus === "fetching";
  const runBootstrapping =
    Boolean(runId) &&
    Boolean(projectId) &&
    !effectiveSummary &&
    (runsLoading || intakeUiPhase === "creating_run");

  const runKeyForMutations =
    effectiveSummary?.runId ?? effectiveSummary?.id ?? runId;
  const clarificationMutations = useClarificationMutations({
    runKey: runKeyForMutations,
    jobId: effectiveSummary?.id ?? null,
    runId: effectiveSummary?.runId ?? null,
    projectId,
    refinementAvailable: orch.clarification.bundle?.refinement.available,
  });
  const gitBranchMut = useGitBranchMutation({
    runKey: runKeyForMutations,
    projectId,
  });

  const runMissing =
    !runBootstrapping &&
    !runsLoading &&
    Boolean(runId) &&
    Boolean(projectId) &&
    !effectiveSummary &&
    (rq.data?.summaries.length ?? 0) > 0;

  const onRefreshAll = () => {
    void qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
  };

  const { addProjectDialogProps, openAddProjectDialog } =
    useAddProjectFlow(onRefreshAll);

  const centralEmptyNoActivity =
    Boolean(projectId) && !runId && !newActivityFlow;

  const centralNoProjectPicked =
    !projectId && projectCount > 0 && !projectsLoading;

  const centralNoProjects =
    !projectsLoading && projectCount === 0 && connection.reachable;

  const centralNoProjectsOffline =
    !projectsLoading && projectCount === 0 && !connection.reachable;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <AddProjectDialog {...addProjectDialogProps} />

      <ExecutionFeed scrollRef={scrollRef}>
        {projectsLoading ? (
          <div className="py-16">
            <LoadingState />
          </div>
        ) : centralNoProjectsOffline ? (
          <EmptyState
            variant="operational"
            icon={Inbox}
            title={t("runShell.runtimeOfflineTitle")}
            hint={t("runShell.runtimeOfflineHint")}
            className="py-12"
          />
        ) : centralNoProjects ? (
          <div className="py-6">
            <EmptyState
              variant="operational"
              icon={Inbox}
              title={t("runShell.noProjectsTitle")}
              hint={t("runShell.noProjectsHint")}
              className="py-8"
              actions={
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 shadow-sm"
                    onClick={() => openAddProjectDialog()}
                    disabled={!connection.reachable}
                  >
                    <Plus className="size-3.5" />
                    {t("sidebar.addGitRepo")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5 border-border/60 shadow-sm"
                    onClick={onRefreshAll}
                  >
                    <RefreshCw className="size-3.5" />
                    {t("runShell.refreshProjects")}
                  </Button>
                </>
              }
            />
          </div>
        ) : centralNoProjectPicked || centralEmptyNoActivity ? (
          <CentralColumnIdleGuide />
        ) : composeOnlyInit ? (
          <InitializationPhasePanel
            projectId={projectId}
            runId={null}
            operationalUx={orch.operationalUx}
            composeOnly
            createResult={createResult}
            submissionBusy={submissionBusy}
          />
        ) : effectiveSummary && runId ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {selectedWorkspaceRunId && workspace ? (
              <WorkspaceContextCard
                workspace={workspace}
                allProjects={pq.data?.projects ?? []}
                projectIdsOverride={workspaceProjectIds}
              />
            ) : null}
            <OperationalPhaseStack
              projectId={projectId}
              runId={runId}
              summary={effectiveSummary}
              operationalUx={orch.operationalUx}
              submissionBusy={submissionBusy}
              createResult={createResult}
              operationalPanelInput={operationalPanelInput}
              reviewHitl={operationalReview.hitl}
              finalizationHitl={operationalFinalization.hitl}
              executionLifecyclePhase={orch.execution.lifecyclePhase ?? null}
              workspaceExecutionPanel={
                workspaceOperational && workspaceRun ? (
                  <WorkspaceOperationalPhasePanel
                    workspaceRun={workspaceRun}
                    git={workspaceGit}
                    projectsById={
                      new Map(
                        (pq.data?.projects ?? []).map((p) => [p.id, p]),
                      )
                    }
                  />
                ) : null
              }
            />
          </div>
        ) : runsLoading || runBootstrapping ? (
          <div className="py-12">
            <LoadingState />
            <p className="cs-text-body mt-3 text-center text-muted-foreground">
              {runBootstrapping
                ? t("taskIntake.startingExecution")
                : t("runShell.loadingProjectRuns")}
            </p>
          </div>
        ) : runMissing ? (
          <EmptyState
            variant="operational"
            icon={Inbox}
            title={t("runShell.runNotFoundTitle")}
            hint={t("runShell.runNotFoundHint")}
            className="py-12"
          />
        ) : (
          <>
            <OperationalUxPanel
              projectId={projectId}
              runId={runId}
              summary={effectiveSummary}
              attentionHint={attentionHint}
              onPrepareBranch={() => gitBranchMut.prepareBranch.mutate()}
              prepareBranchPending={gitBranchMut.prepareBranch.isPending}
            />
          </>
        )}
      </ExecutionFeed>
    </section>
  );
}
