"use client";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/primitives/Surface";
import { useWorkspaceRunMutations } from "@/hooks/use-workspace-run-mutations";
import type { MiniActivityDto } from "@/lib/api/mini-activity-types";
import type { WorkspaceRunStatus } from "@/lib/api/workspace-run-types";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { cn } from "@/lib/utils";
import { ExternalLink, Loader2, Play, RotateCcw, SkipForward } from "lucide-react";

function miniStatusLabel(status: string) {
  switch (status) {
    case "completed":
      return "Concluída";
    case "running":
      return "Em execução";
    case "failed":
      return "Falhou";
    case "skipped":
      return "Ignorada";
    case "waiting_user_action":
      return "Aguarda utilizador";
    case "ready":
      return "Pronta";
    case "pending":
    default:
      return "Pendente";
  }
}

function projectName(projectId: string, projectsById: Map<string, ProjectSummaryDto>) {
  return projectsById.get(projectId)?.displayName?.trim() || projectId;
}

export function WorkspaceMiniActivitiesCard({
  workspaceRunId,
  workspaceStatus,
  miniActivities,
  projectsById,
}: {
  workspaceRunId: string;
  workspaceStatus: WorkspaceRunStatus;
  miniActivities: MiniActivityDto[];
  projectsById: Map<string, ProjectSummaryDto>;
}) {
  const mutations = useWorkspaceRunMutations(workspaceRunId);
  const setProject = useMissionShellStore((s) => s.setSelectedProject);
  const setRun = useMissionShellStore((s) => s.setSelectedRun);
  const setWorkspaceRun = useMissionShellStore((s) => s.setSelectedWorkspaceRun);

  const sorted = [...miniActivities].sort((a, b) => a.order - b.order);
  const hasMinis = sorted.length > 0;
  const canStart =
    hasMinis && ["draft", "planned"].includes(workspaceStatus);
  const canResume =
    hasMinis &&
    ["running", "waiting_user_action", "failed"].includes(workspaceStatus);

  const orchestrationError = mutations.start.error ?? mutations.resume.error ?? null;

  return (
    <Surface variant="strip" className="space-y-3 border-border/60 p-4">
      <div>
        <p className="text-[12px] font-semibold tracking-tight text-foreground">
          Mini-atividades
        </p>
        <p className="text-[10px] text-muted-foreground">
          Sequência orquestrada por projeto
        </p>
      </div>

      <WorkspaceRunOrchestrationButtons
        canStart={canStart}
        canResume={canResume}
        startPending={mutations.start.isPending}
        resumePending={mutations.resume.isPending}
        onStart={() => mutations.start.mutate()}
        onResume={() => mutations.resume.mutate()}
      />

      {orchestrationError ? (
        <p className="text-[10px] text-sb-failed" role="alert">
          {mutations.workspaceMutationErrorMessage(orchestrationError)}
        </p>
      ) : null}

      {!sorted.length ? (
        <p className="text-[11px] text-muted-foreground">
          As etapas operacionais aparecem aqui após aprovar o plano e gerar a
          estratégia multi-projeto.
        </p>
      ) : (
        <WorkspaceMiniActivitiesGroupedList
          sorted={sorted}
          projectsById={projectsById}
          mutations={mutations}
          onOpenChildRun={(mini) => {
            setWorkspaceRun(null);
            setProject(mini.targetProjectId);
            setRun(mini.runId!);
          }}
        />
      )}
    </Surface>
  );
}

function WorkspaceRunOrchestrationButtons({
  canStart,
  canResume,
  startPending,
  resumePending,
  onStart,
  onResume,
}: {
  canStart: boolean;
  canResume: boolean;
  startPending: boolean;
  resumePending: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  if (!canStart && !canResume) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {canStart ? (
        <Button
          type="button"
          size="sm"
          className={cn("h-8 gap-1.5 text-[11px]")}
          disabled={startPending}
          onClick={onStart}
        >
          {startPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Play className="size-3.5" aria-hidden />
          )}
          Start workspace run
        </Button>
      ) : null}
      {canResume ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 gap-1.5 text-[11px]"
          disabled={resumePending}
          onClick={onResume}
        >
          {resumePending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Play className="size-3.5" aria-hidden />
          )}
          Resume
        </Button>
      ) : null}
    </div>
  );
}

function WorkspaceMiniActivitiesGroupedList({
  sorted,
  projectsById,
  mutations,
  onOpenChildRun,
}: {
  sorted: MiniActivityDto[];
  projectsById: Map<string, ProjectSummaryDto>;
  mutations: ReturnType<typeof useWorkspaceRunMutations>;
  onOpenChildRun: (mini: MiniActivityDto) => void;
}) {
  const orderById = new Map(sorted.map((m) => [m.miniActivityId, m.order + 1]));
  const groups = new Map<string, MiniActivityDto[]>();
  for (const mini of sorted) {
    const key = mini.targetProjectId;
    const list = groups.get(key) ?? [];
    list.push(mini);
    groups.set(key, list);
  }

  return (
    <div className="space-y-3">
      {[...groups.entries()].map(([projectId, minis]) => (
        <div key={projectId} className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {projectName(projectId, projectsById)}
          </p>
          <ul className="space-y-2">
            {minis.map((mini) => (
              <MiniActivityListItem
                key={mini.miniActivityId}
                mini={mini}
                projectsById={projectsById}
                mutations={mutations}
                dependencyLabels={dependencyStepLabels(mini, orderById)}
                onOpenChildRun={
                  mini.runId ? () => onOpenChildRun(mini) : undefined
                }
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function dependencyStepLabels(
  mini: MiniActivityDto,
  orderById: Map<string, number>,
): string[] {
  return (mini.dependsOnMiniActivityIds ?? [])
    .map((id) => orderById.get(id))
    .filter((n): n is number => typeof n === "number")
    .map((n) => `etapa ${n}`);
}

function MiniActivityListItem({
  mini,
  projectsById,
  mutations,
  dependencyLabels,
  onOpenChildRun,
}: {
  mini: MiniActivityDto;
  projectsById: Map<string, ProjectSummaryDto>;
  mutations: ReturnType<typeof useWorkspaceRunMutations>;
  dependencyLabels?: string[];
  onOpenChildRun?: () => void;
}) {
  const retryable = ["failed", "waiting_user_action", "cancelled"].includes(mini.status);
  const skippable = !["completed", "skipped"].includes(mini.status);

  return (
    <li className="rounded-md border border-border/50 bg-muted/15 px-2.5 py-2 text-[11px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground/90">
            #{mini.order + 1} · {mini.title}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Projeto: {projectName(mini.targetProjectId, projectsById)}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Status:{" "}
            <span className="text-foreground/85">{miniStatusLabel(mini.status)}</span>
          </p>
          {mini.runId ? (
            <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
              run: {mini.runId}
            </p>
          ) : null}
          {dependencyLabels?.length ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Depende de: {dependencyLabels.join(", ")}
            </p>
          ) : null}
        </div>
        {onOpenChildRun ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 gap-1 px-2 text-[10px]"
            onClick={onOpenChildRun}
          >
            <ExternalLink className="size-3" aria-hidden />
            Run filho
          </Button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {retryable ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[10px]"
            disabled={mutations.retryMini.isPending}
            onClick={() => mutations.retryMini.mutate(mini.miniActivityId)}
          >
            {mutations.retryMini.isPending ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="size-3" aria-hidden />
            )}
            Retry
          </Button>
        ) : null}
        {skippable ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[10px]"
            disabled={mutations.skipMini.isPending}
            onClick={() => mutations.skipMini.mutate(mini.miniActivityId)}
          >
            <SkipForward className="size-3" aria-hidden />
            Skip
          </Button>
        ) : null}
      </div>
    </li>
  );
}


