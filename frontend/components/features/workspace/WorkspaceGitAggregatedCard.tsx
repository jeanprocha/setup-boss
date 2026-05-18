"use client";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/primitives/Surface";
import { useWorkspaceRunMutations } from "@/hooks/use-workspace-run-mutations";
import type { WorkspaceGitDto } from "@/lib/api/workspace-git-types";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";
import { cn } from "@/lib/utils";
import { GitBranch, Loader2, RefreshCw } from "lucide-react";

function statusLabel(status: string | undefined) {
  switch (status) {
    case "ready":
      return "Pronto";
    case "preparing":
      return "A preparar";
    case "partial_failure":
      return "Falha parcial";
    case "failed":
      return "Falhou";
    case "skipped":
      return "Ignorado";
    case "pending":
    default:
      return "Pendente";
  }
}

function projectDisplayName(
  projectId: string,
  projectsById: Map<string, ProjectSummaryDto>,
) {
  const p = projectsById.get(projectId);
  return p?.displayName?.trim() || projectId;
}

export function WorkspaceGitAggregatedCard({
  workspaceRunId,
  git,
  projectsById,
  onRefresh,
}: {
  workspaceRunId: string;
  git: WorkspaceGitDto | null;
  projectsById: Map<string, ProjectSummaryDto>;
  onRefresh?: () => void;
}) {
  const mutations = useWorkspaceRunMutations(workspaceRunId);
  const aggregateStatus = git?.status ?? "pending";
  const activityBranch = git?.activityBranch ?? null;
  const apiError =
    mutations.prepareGit.error != null
      ? mutations.workspaceMutationErrorMessage(mutations.prepareGit.error)
      : null;

  return (
    <Surface variant="strip" className="space-y-3 border-border/60 p-4">
      <div className="flex items-start gap-2">
        <GitBranch className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
          <p className="text-[12px] font-semibold tracking-tight text-foreground">
            Git agregado (workspace)
          </p>
          <p className="text-[10px] text-muted-foreground">
            Mesma branch de atividade em todos os projetos participantes
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-[11px]">
        <p className="font-medium text-foreground/90">Estado global</p>
        <p className="mt-1 text-muted-foreground">
          Status:{" "}
          <span
            className={cn(
              "font-medium",
              aggregateStatus === "ready" ? "text-emerald-400/90" : "text-foreground/85",
            )}
          >
            {statusLabel(aggregateStatus)}
          </span>
        </p>
        {activityBranch ? (
          <p className="mt-0.5 font-mono text-[10px] text-foreground/80">
            Branch: {activityBranch}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-[11px]"
          disabled={mutations.prepareGit.isPending}
          onClick={() => mutations.prepareGit.mutate({})}
        >
          {mutations.prepareGit.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <GitBranch className="size-3.5" aria-hidden />
          )}
          Preparar Git
        </Button>
        {onRefresh ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-[11px]"
            onClick={() => void onRefresh()}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Atualizar
          </Button>
        ) : null}
      </div>

      {apiError ? (
        <p className="text-[10px] text-sb-failed" role="alert">
          {apiError}
        </p>
      ) : null}

      {git?.projects?.length ? (
        <ul className="space-y-2">
          {git.projects.map((proj) => {
            const failed = proj.gitStatus === "failed";
            const canRetry = failed || proj.gitStatus === "pending";
            return (
              <li
                key={proj.projectId}
                className="rounded-md border border-border/50 bg-muted/15 px-2.5 py-2 text-[11px]"
              >
                <p className="font-medium text-foreground/90">
                  {projectDisplayName(proj.projectId, projectsById)}
                </p>
                <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                  {proj.projectId}
                </p>
                {proj.baseBranch ? (
                  <p className="mt-1 text-muted-foreground">
                    Base: <span className="text-foreground/80">{proj.baseBranch}</span>
                  </p>
                ) : null}
                <p className="mt-0.5 text-muted-foreground">
                  Status:{" "}
                  <span className="text-foreground/85">
                    {statusLabel(String(proj.gitStatus))}
                  </span>
                </p>
                {proj.errorMessage ? (
                  <p className="mt-1 text-[10px] text-sb-failed">{proj.errorMessage}</p>
                ) : null}
                {canRetry ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-2 h-7 px-2 text-[10px]"
                    disabled={mutations.retryPrepareGitProject.isPending}
                    onClick={() =>
                      mutations.retryPrepareGitProject.mutate(proj.projectId)
                    }
                  >
                    {mutations.retryPrepareGitProject.isPending ? (
                      <Loader2 className="mr-1 size-3 animate-spin" aria-hidden />
                    ) : null}
                    Retry prepare
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Nenhum projeto no estado Git. Use Preparar Git após definir miniActivities.
        </p>
      )}
    </Surface>
  );
}
