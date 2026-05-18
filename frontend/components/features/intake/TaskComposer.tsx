"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProjectRegistry } from "@/hooks/use-project-registry";
import { useProjectGovernance } from "@/hooks/use-project-governance";
import { composeAwaitingInitialSubmit } from "@/lib/runtime/intake/compose-governance-gate";
import {
  governanceRuntimeLogDedupeKey,
  logGovernanceWarningToRuntime,
  resetGovernanceRuntimeLogSession,
} from "@/lib/runtime/governance/log-governance-runtime-observation";
import { useCreateRun } from "@/hooks/use-create-run";
import { logIntakeStartFailure } from "@/stores/ui-diagnostics-store";
import { useRunSummary } from "@/hooks/use-run-summary";
import { useIntakeStore } from "@/stores/intake-store";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useMissionLayoutStore } from "@/stores/mission-layout-store";
import { IaValidationDiagnosticSections } from "@/components/features/observability/IaValidationDiagnosticSections";
import { GovernanceStatusCard } from "@/components/features/governance/GovernanceStatusCard";
import {
  IntakeTimeoutErrorPanel,
  isIntakeTimeoutPreRunError,
} from "@/components/features/intake/IntakeTimeoutErrorPanel";
import {
  formatPreRunDiagnosticCopy,
  intakeInlineTitle,
} from "@/lib/runtime/intake/pre-run-error";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { RecentTaskHints } from "@/components/features/intake/RecentTaskHints";
import { MissionPromptInput } from "@/components/features/intake/MissionPromptInput";
import { OperationalStepOneSectionHeading } from "@/components/features/operational/OperationalStepOneSectionHeading";
import { Loader2, WifiOff, AlertTriangle } from "lucide-react";
import type { IntakePriority, IntakeUiPhase } from "@/lib/runtime/intake/intake-types";
import {
  runPhaseDisplayLabel,
  runtimeStateShortLabel,
} from "@/lib/runtime/adapters/runtime-labels";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

const MIN_TASK_LEN = 12;
const TASK_HINT_MS = 4000;
const DEFAULT_INTAKE_PRIORITY: IntakePriority = "normal";
const PRIMARY_ACTION_BUTTON_CLASS =
  "h-9 gap-1.5 px-4 text-[12px] font-medium shadow-none";

function composerStatusBadgeText(
  uiPhase: IntakeUiPhase,
  hasRun: boolean,
): string {
  if (!hasRun) {
    if (uiPhase === "creating_run") return "A criar corrida…";
    return "Pronto para enviar";
  }
  switch (uiPhase) {
    case "creating_run":
      return "A criar corrida…";
    case "failed":
      return "Falha ao criar corrida";
    case "clarification_required":
      return "Aguardando clarificação";
    case "clarification_ready":
      return "Clarificação pronta";
    case "strategy_pending":
      return "Planeamento em curso";
    case "intake_running":
      return "Intake em curso";
    default:
      return "Corrida activa";
  }
}

export function TaskComposer({
  projectId,
  embedded = false,
  operationalMode = false,
}: {
  projectId: string | null;
  embedded?: boolean;
  /** Oculta rótulos técnicos (intake, phase) — painel Inicialização operacional. */
  operationalMode?: boolean;
}) {
  const { t } = useI18n();
  const taskDraft = useIntakeStore((s) => s.taskDraft);
  const setTaskDraft = useIntakeStore((s) => s.setTaskDraft);
  const resetSubmission = useIntakeStore((s) => s.resetSubmission);
  const uiPhase = useIntakeStore((s) => s.uiPhase);
  const lastError = useIntakeStore((s) => s.lastError);
  const lastPreRunError = useIntakeStore((s) => s.lastPreRunError);
  const setLastError = useIntakeStore((s) => s.setLastError);
  const runId = useMissionShellStore((s) => s.selectedRunId);
  const newActivityFlow = useMissionShellStore((s) => s.newActivityFlow);

  /** Só antes da corrida existir no fluxo “nova atividade”. */
  const composeOnly = Boolean(newActivityFlow && !runId);
  const preSubmitCompose = composeAwaitingInitialSubmit(composeOnly, uiPhase);

  const registry = useProjectRegistry();
  const governanceQ = useProjectGovernance(
    composeOnly &&
      !preSubmitCompose &&
      projectId &&
      registry.projectValid
      ? projectId
      : null,
  );
  const governanceUx = governanceQ.data ?? null;
  const showGovernanceBlockedCard = governanceUx?.readiness === "blocked";
  const loggedGovernanceKeyRef = useRef<string | null>(null);
  const create = useCreateRun();
  const summary = useRunSummary(projectId, runId);
  const connection = useRuntimeConnectionStore((s) => s.connection);
  const [showTaskRequiredHint, setShowTaskRequiredHint] = useState(false);
  const taskHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPersistedRun = Boolean(runId && summary);

  const busy = create.isPending || uiPhase === "creating_run";
  const offline = !connection.reachable;
  const noProject = !projectId;
  const staleProjectId = registry.staleProjectId;
  const invalidProject =
    composeOnly &&
    registry.projectsListReady &&
    Boolean(projectId) &&
    !registry.projectValid;
  const canSubmit =
    composeOnly &&
    Boolean(projectId) &&
    registry.projectValid &&
    taskDraft.trim().length >= MIN_TASK_LEN &&
    !busy &&
    !offline &&
    !noProject &&
    !invalidProject;

  const readOnlyFields = !composeOnly || busy;
  const taskTooShort = taskDraft.trim().length < MIN_TASK_LEN;

  useEffect(() => {
    if (!taskTooShort) setShowTaskRequiredHint(false);
  }, [taskTooShort]);

  useEffect(() => {
    return () => {
      if (taskHintTimerRef.current) clearTimeout(taskHintTimerRef.current);
    };
  }, []);

  useEffect(() => {
    loggedGovernanceKeyRef.current = null;
    resetGovernanceRuntimeLogSession(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!composeOnly || !projectId || !governanceUx) return;
    if (governanceUx.readiness !== "warning") return;
    const key = governanceRuntimeLogDedupeKey(projectId, governanceUx);
    if (loggedGovernanceKeyRef.current === key) return;
    loggedGovernanceKeyRef.current = key;
    logGovernanceWarningToRuntime(projectId, governanceUx);
  }, [composeOnly, projectId, governanceUx]);

  const onSubmit = () => {
    if (!projectId || !canSubmit || create.isPending) return;
    create.mutate({
      projectId,
      task: taskDraft.trim(),
      metadata: {
        skipLlm: true,
        priority: DEFAULT_INTAKE_PRIORITY,
        source: "mission_control",
      },
    });
  };

  const showTaskRequiredMessage = () => {
    setShowTaskRequiredHint(true);
    if (taskHintTimerRef.current) clearTimeout(taskHintTimerRef.current);
    taskHintTimerRef.current = setTimeout(
      () => setShowTaskRequiredHint(false),
      TASK_HINT_MS,
    );
  };

  const handleStartClick = () => {
    if (canSubmit) {
      setShowTaskRequiredHint(false);
      onSubmit();
      return;
    }
    if (busy || offline) return;
    if (invalidProject && projectId) {
      logIntakeStartFailure({
        projectId,
        selectedProjectId: registry.selectedProjectId,
        endpoint: "POST /runs",
        status: 0,
        apiMessage: "blocked in UI — project not in registry",
        phase: "preflight",
      });
      setLastError(t("taskIntake.projectUnavailable"));
      return;
    }
    if (noProject || !taskTooShort) return;
    showTaskRequiredMessage();
  };

  const phaseHint =
    summary?.phase != null ? runPhaseDisplayLabel(summary.phase) : null;

  const showStreamHeader =
    !operationalMode && (!embedded || !composeOnly);

  const taskPlaceholder = operationalMode
    ? "Descreva o que pretende realizar nesta atividade…"
    : "Ex.: Implementar POST /runs no daemon e integrar Mission Control…";

  return (
    <div
      className={cn(
        operationalMode && composeOnly ? "space-y-5" : "space-y-2.5",
      )}
    >
      {showStreamHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="cs-text-caption font-medium uppercase tracking-wide">
            {t("runShell.taskIntakeTitle")}
          </span>
          {!composeOnly ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className="text-[10px] font-normal text-foreground/90"
              >
                {composerStatusBadgeText(uiPhase, hasPersistedRun)}
              </Badge>
              {summary ? (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {runtimeStateShortLabel(summary.state)}
                </Badge>
              ) : null}
              {phaseHint ? (
                <span className="cs-text-caption">{phaseHint}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn("space-y-2", operationalMode && composeOnly && "space-y-2.5")}
      >
        {operationalMode && composeOnly ? (
          <OperationalStepOneSectionHeading>
            Descrição da atividade
          </OperationalStepOneSectionHeading>
        ) : (
          <span className="sr-only">Tarefa operacional</span>
        )}
        <MissionPromptInput
          value={taskDraft}
          onChange={setTaskDraft}
          readOnly={readOnlyFields}
          disabled={busy}
          placeholder={taskPlaceholder}
          aria-label="Descrição da atividade"
        />
      </div>

      {composeOnly && !operationalMode ? (
        <RecentTaskHints onPick={setTaskDraft} disabled={busy} />
      ) : null}

      {offline ? (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-200/90">
          <WifiOff className="size-3" />
          {t("taskIntake.runtimeOfflineDraft")}
        </p>
      ) : null}
      {noProject && !offline ? (
        <p className="text-[11px] text-amber-200/90">
          {t("taskIntake.selectRegisteredProject")}
        </p>
      ) : null}

      {invalidProject && staleProjectId ? (
        <div className="space-y-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1.5">
          <p className="text-[11px] text-amber-900 dark:text-amber-100/95">
            {t("taskIntake.invalidProjectHint", {
              id: staleProjectId,
              count: registry.projects.length,
            })}
          </p>
          <p className="text-[11px] text-amber-900/90 dark:text-amber-100/80">
            {t("taskIntake.projectUnavailable")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => registry.refreshProjects()}
            >
              {t("taskIntake.refreshProjects")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() =>
                registry.clearInvalidProjectSelection({ autoPickFirst: true })
              }
            >
              {t("taskIntake.selectProjectAction")}
            </Button>
          </div>
        </div>
      ) : null}

      {lastError && !invalidProject ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/8 px-2 py-1.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 space-y-1.5">
            {lastPreRunError && isIntakeTimeoutPreRunError(lastPreRunError) ? (
              <IntakeTimeoutErrorPanel
                error={lastPreRunError}
                onRetry={() => {
                  resetSubmission();
                  create.reset();
                }}
              />
            ) : null}
            {lastPreRunError && !isIntakeTimeoutPreRunError(lastPreRunError) ? (
              <p className="text-[12px] font-semibold text-destructive/95">
                {intakeInlineTitle(lastPreRunError)}
              </p>
            ) : null}
            {!isIntakeTimeoutPreRunError(lastPreRunError) ? (
              <p className="text-[11px] text-destructive/95">{lastError}</p>
            ) : null}
            {lastPreRunError?.validationSnapshot?.summary &&
            !isIntakeTimeoutPreRunError(lastPreRunError) ? (
              <p className="font-mono text-[10px] text-muted-foreground">
                {String(lastPreRunError.validationSnapshot.summary)}
                {lastPreRunError.validationSnapshot.validationDurationMs != null
                  ? ` · ${String(lastPreRunError.validationSnapshot.validationDurationMs)}ms`
                  : ""}
              </p>
            ) : null}
            {lastPreRunError?.iaValidation &&
            !isIntakeTimeoutPreRunError(lastPreRunError) ? (
              <IaValidationDiagnosticSections ia={lastPreRunError.iaValidation} />
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {lastPreRunError && !isIntakeTimeoutPreRunError(lastPreRunError) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      formatPreRunDiagnosticCopy(lastPreRunError),
                    );
                  }}
                >
                  Copiar diagnóstico completo
                </Button>
              ) : null}
              {!isIntakeTimeoutPreRunError(lastPreRunError) ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => {
                      useMissionLayoutStore.getState().setRightTimelineOpen(true);
                      useMissionLayoutStore.getState().setRightPanelTab("observe");
                    }}
                  >
                    {t("taskIntake.viewObservability")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => {
                      resetSubmission();
                      create.reset();
                    }}
                  >
                    {t("common.tryAgain")}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {composeOnly &&
      !operationalMode &&
      projectId &&
      registry.projectValid &&
      showGovernanceBlockedCard ? (
        <GovernanceStatusCard projectId={projectId} compact />
      ) : null}

      {composeOnly ? (
        <div className="space-y-2">
          <div
            className={cn(
              "flex",
              operationalMode ? "justify-end" : "w-full",
            )}
          >
            <Button
              type="button"
              size="sm"
              disabled={busy}
              className={cn(
                PRIMARY_ACTION_BUTTON_CLASS,
                operationalMode ? "" : "w-full",
                !operationalMode &&
                  (canSubmit && !busy
                    ? "transition-[background-color,box-shadow,transform] duration-150 hover:bg-primary/85 hover:shadow-sm active:scale-[0.995] active:bg-primary/75"
                    : "opacity-45"),
                operationalMode &&
                  !canSubmit &&
                  !busy &&
                  "opacity-70",
              )}
              onClick={handleStartClick}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {busy
                ? t("taskIntake.startingExecution")
                : t("taskIntake.startExecution")}
            </Button>
          </div>
          {busy ? (
            <p role="status" className="cs-text-caption text-muted-foreground">
              {t("taskIntake.startingExecution")}
            </p>
          ) : null}
          {showTaskRequiredHint ? (
            <p
              role="status"
              className="cs-text-caption animate-in fade-in slide-in-from-top-1 text-amber-700 duration-200 dark:text-amber-200/90"
            >
              {t("taskIntake.describeTaskHint", { min: MIN_TASK_LEN })}
            </p>
          ) : null}
          {invalidProject && !staleProjectId && registry.projectsLoading ? (
            <p className="cs-text-caption text-muted-foreground">
              {t("sidebar.loadingActivities")}
            </p>
          ) : null}
        </div>
      ) : null}

      {!projectId && registry.projects.length ? (
        <p className="text-[10px] text-muted-foreground">
          {t("taskIntake.selectProjectShort")}
        </p>
      ) : null}
    </div>
  );
}
