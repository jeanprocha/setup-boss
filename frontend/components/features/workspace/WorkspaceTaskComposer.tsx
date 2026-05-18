"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCreateWorkspaceRun } from "@/hooks/use-create-workspace-run";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useProjects } from "@/hooks/use-projects";
import { useIntakeStore } from "@/stores/intake-store";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { MissionPromptInput } from "@/components/features/intake/MissionPromptInput";
import { WorkspaceContextCard } from "@/components/features/workspace/WorkspaceContextCard";
import { RecentTaskHints } from "@/components/features/intake/RecentTaskHints";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import { Loader2, WifiOff } from "lucide-react";
import {
  projectsByIdMap,
  resolveProjectsForWorkspace,
} from "@/lib/workspace/partition-projects-by-workspace";
import { parseWorkspaceGlobalSpec } from "@/lib/workspace/workspace-global-spec";

const MIN_TASK_LEN = 12;
const TASK_HINT_MS = 4000;

export function WorkspaceTaskComposer({
  workspaceId,
  embedded = false,
}: {
  workspaceId: string | null;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const taskDraft = useIntakeStore((s) => s.taskDraft);
  const setTaskDraft = useIntakeStore((s) => s.setTaskDraft);
  const uiPhase = useIntakeStore((s) => s.uiPhase);
  const lastError = useIntakeStore((s) => s.lastError);
  const setLastError = useIntakeStore((s) => s.setLastError);
  const newActivityFlow = useMissionShellStore((s) => s.newActivityFlow);
  const workspaceRunId = useMissionShellStore((s) => s.selectedWorkspaceRunId);

  const composeOnly = Boolean(newActivityFlow && !workspaceRunId);
  const create = useCreateWorkspaceRun();
  const connection = useRuntimeConnectionStore((s) => s.connection);
  const workspacesQuery = useWorkspaces();
  const projectsQuery = useProjects();

  const workspace = useMemo(
    () =>
      (workspacesQuery.data?.workspaces ?? []).find(
        (w) => w.workspaceId === workspaceId,
      ) ?? null,
    [workspacesQuery.data?.workspaces, workspaceId],
  );

  const projectsInWorkspace = useMemo(() => {
    if (!workspace) return [];
    return resolveProjectsForWorkspace(
      workspace,
      projectsByIdMap(projectsQuery.data?.projects ?? []),
    );
  }, [workspace, projectsQuery.data?.projects]);

  const projectIds = workspace?.projectIds ?? [];

  const busy = create.isPending || uiPhase === "creating_run";
  const offline = !connection.reachable;
  const noWorkspace = !workspaceId || !workspace;
  const taskTooShort = taskDraft.trim().length < MIN_TASK_LEN;

  const canSubmit =
    composeOnly &&
    Boolean(workspaceId) &&
    Boolean(workspace) &&
    projectIds.length > 0 &&
    !taskTooShort &&
    !busy &&
    !offline;

  const [showTaskRequiredHint, setShowTaskRequiredHint] = useState(false);
  const taskHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (taskHintTimerRef.current) clearTimeout(taskHintTimerRef.current);
    };
  }, []);

  const onSubmit = () => {
    if (!workspaceId || !workspace || !canSubmit || create.isPending) return;
    create.mutate({
      workspaceId,
      task: taskDraft.trim(),
      projectIds,
      projectsCatalog: projectsInWorkspace,
    });
  };

  const handleStartClick = () => {
    if (canSubmit) {
      setShowTaskRequiredHint(false);
      onSubmit();
      return;
    }
    if (busy || offline || noWorkspace) return;
    if (!taskTooShort) return;
    setShowTaskRequiredHint(true);
    if (taskHintTimerRef.current) clearTimeout(taskHintTimerRef.current);
    taskHintTimerRef.current = setTimeout(
      () => setShowTaskRequiredHint(false),
      TASK_HINT_MS,
    );
  };

  if (!composeOnly && workspaceRunId) {
    return null;
  }

  return (
    <div className={cn("space-y-4", !embedded && "mx-auto w-full max-w-2xl")}>
      {workspace ? (
        <WorkspaceContextCard
          workspace={workspace}
          allProjects={projectsQuery.data?.projects ?? []}
        />
      ) : null}

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground/90">
          {t("workspaceRun.taskPromptLabel")}
        </p>
        <MissionPromptInput
          value={taskDraft}
          onChange={setTaskDraft}
          readOnly={!composeOnly || busy}
          disabled={busy}
          placeholder={t("workspaceRun.taskPlaceholder")}
          aria-label={t("workspaceRun.taskPromptLabel")}
        />
      </div>

      {composeOnly ? <RecentTaskHints onPick={setTaskDraft} disabled={busy} /> : null}

      {offline ? (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-200/90">
          <WifiOff className="size-3" />
          {t("taskIntake.runtimeOfflineDraft")}
        </p>
      ) : null}

      {noWorkspace && !offline ? (
        <p className="text-[11px] text-amber-200/90">
          {t("workspaceRun.selectWorkspace")}
        </p>
      ) : null}

      {!projectIds.length && workspace ? (
        <p className="text-[11px] text-amber-200/90">
          {t("workspaceRun.noProjectsInWorkspace")}
        </p>
      ) : null}

      {lastError ? (
        <p className="text-[11px] text-sb-failed" role="alert">
          {lastError}
        </p>
      ) : null}

      {showTaskRequiredHint && taskTooShort ? (
        <p className="text-[11px] text-muted-foreground">
          {t("taskIntake.taskMinLength", { min: MIN_TASK_LEN })}
        </p>
      ) : null}

      {composeOnly ? (
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5 px-4 text-[12px] font-medium"
            disabled={!canSubmit}
            onClick={handleStartClick}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            {t("workspaceRun.startActivity")}
          </Button>
        </div>
      ) : null}

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {t("workspaceRun.pipelineHint")}
      </p>
    </div>
  );
}

/** Mostra tarefa global quando o WorkspaceRun já existe (modo leitura). */
export function WorkspaceGlobalTaskSummary({
  globalSpec,
}: {
  globalSpec: string | Record<string, unknown> | null | undefined;
}) {
  const parsed = parseWorkspaceGlobalSpec(globalSpec);
  if (!parsed?.task) return null;
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Descrição da atividade
      </p>
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
        {parsed.task}
      </p>
    </div>
  );
}
