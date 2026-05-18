"use client";

import { Button } from "@/components/ui/button";
import { useWorkspaceRunMutations } from "@/hooks/use-workspace-run-mutations";
import type { WorkspaceGitDto } from "@/lib/api/workspace-git-types";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";
import { cn } from "@/lib/utils";
import { GitBranch, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";

function statusLabel(status: string | undefined, t: (k: string) => string) {
  switch (status) {
    case "ready":
      return t("workspaceRun.gitReady");
    case "preparing":
      return t("workspaceRun.gitPreparing");
    case "partial_failure":
      return t("workspaceRun.gitPartialFailure");
    case "failed":
      return t("workspaceRun.gitFailed");
    default:
      return t("workspaceRun.gitPending");
  }
}

function projectDisplayName(
  projectId: string,
  projectsById: Map<string, ProjectSummaryDto>,
) {
  const p = projectsById.get(projectId);
  return p?.displayName?.trim() || projectId;
}

export function WorkspaceGitOperationalStrip({
  workspaceRunId,
  git,
  projectsById,
}: {
  workspaceRunId: string;
  git: WorkspaceGitDto | null;
  projectsById: Map<string, ProjectSummaryDto>;
}) {
  const { t } = useI18n();
  const mutations = useWorkspaceRunMutations(workspaceRunId);
  const aggregateStatus = git?.status ?? "pending";
  const activityBranch = git?.activityBranch ?? null;
  const canPrepare = aggregateStatus !== "ready" && aggregateStatus !== "preparing";
  const apiError =
    mutations.prepareGit.error != null
      ? mutations.workspaceMutationErrorMessage(mutations.prepareGit.error)
      : null;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5 text-[11px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <GitBranch className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-foreground/90">{t("workspaceRun.gitStripTitle")}</p>
            <p className="mt-0.5 text-muted-foreground">
              {statusLabel(aggregateStatus, t)}
              {activityBranch ? (
                <>
                  {" · "}
                  <span className="font-mono text-[10px] text-foreground/80">
                    {activityBranch}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        {canPrepare ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 text-[10px]"
            disabled={mutations.prepareGit.isPending}
            onClick={() => mutations.prepareGit.mutate({})}
          >
            {mutations.prepareGit.isPending ? (
              <Loader2 className="mr-1 size-3 animate-spin" aria-hidden />
            ) : null}
            {t("workspaceRun.prepareGit")}
          </Button>
        ) : null}
      </div>
      {git?.projects?.length ? (
        <ul className="mt-2 space-y-0.5 border-t border-border/40 pt-2 text-muted-foreground">
          {git.projects.map((p) => (
            <li key={p.projectId} className="flex justify-between gap-2">
              <span className="truncate">{projectDisplayName(p.projectId, projectsById)}</span>
              <span
                className={cn(
                  "shrink-0 font-medium",
                  p.gitStatus === "ready" ? "text-emerald-400/90" : "text-foreground/75",
                )}
              >
                {statusLabel(String(p.gitStatus), t)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {apiError ? (
        <p className="mt-2 text-[10px] text-sb-failed" role="alert">
          {apiError}
        </p>
      ) : null}
    </div>
  );
}
