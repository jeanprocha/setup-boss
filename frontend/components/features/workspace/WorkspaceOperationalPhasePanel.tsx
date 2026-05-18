"use client";

import { Button } from "@/components/ui/button";
import { useWorkspaceRunMutations } from "@/hooks/use-workspace-run-mutations";
import type { WorkspaceRunDto } from "@/lib/api/workspace-run-types";
import type { WorkspaceGitDto } from "@/lib/api/workspace-git-types";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { findActiveWorkspaceMiniId } from "@/lib/workspace/workspace-mini-activity-operational";
import { WorkspaceGitOperationalStrip } from "@/components/features/workspace/WorkspaceGitOperationalStrip";
import { WorkspaceMiniActivityOperationalTimeline } from "@/components/features/workspace/WorkspaceMiniActivityOperationalTimeline";
import { cn } from "@/lib/utils";
import { Loader2, Play } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";

export function WorkspaceOperationalPhasePanel({
  workspaceRun,
  git,
  projectsById,
}: {
  workspaceRun: WorkspaceRunDto;
  git: WorkspaceGitDto | null;
  projectsById: Map<string, ProjectSummaryDto>;
}) {
  const { t } = useI18n();
  const mutations = useWorkspaceRunMutations(workspaceRun.workspaceRunId);
  const setProject = useMissionShellStore((s) => s.setSelectedProject);
  const setRun = useMissionShellStore((s) => s.setSelectedRun);
  const setWorkspaceRun = useMissionShellStore((s) => s.setSelectedWorkspaceRun);

  const minis = workspaceRun.miniActivities ?? [];
  const activeMiniId = findActiveWorkspaceMiniId(minis);
  const hasMinis = minis.length > 0;
  const canStart =
    hasMinis && ["draft", "planned"].includes(workspaceRun.status);
  const canResume =
    hasMinis &&
    ["running", "waiting_user_action", "failed"].includes(workspaceRun.status);

  const orchestrationError = mutations.start.error ?? mutations.resume.error ?? null;

  return (
    <div className="space-y-4">
      <WorkspaceGitOperationalStrip
        workspaceRunId={workspaceRun.workspaceRunId}
        git={git}
        projectsById={projectsById}
      />

      {(canStart || canResume) && (
        <div className="flex flex-wrap gap-2">
          {canStart ? (
            <Button
              type="button"
              size="sm"
              className={cn("h-8 gap-1.5 text-[11px]")}
              disabled={mutations.start.isPending}
              onClick={() => mutations.start.mutate()}
            >
              {mutations.start.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Play className="size-3.5" aria-hidden />
              )}
              {t("workspaceRun.startExecution")}
            </Button>
          ) : null}
          {canResume ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 gap-1.5 text-[11px]"
              disabled={mutations.resume.isPending}
              onClick={() => mutations.resume.mutate()}
            >
              {mutations.resume.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Play className="size-3.5" aria-hidden />
              )}
              {t("workspaceRun.resumeExecution")}
            </Button>
          ) : null}
        </div>
      )}

      {orchestrationError ? (
        <p className="text-[11px] text-sb-failed" role="alert">
          {mutations.workspaceMutationErrorMessage(orchestrationError)}
        </p>
      ) : null}

      <WorkspaceMiniActivityOperationalTimeline
        miniActivities={minis}
        projectsById={projectsById}
        activeMiniActivityId={activeMiniId}
        mutations={mutations}
        onOpenChildRun={(mini) => {
          if (!mini.runId) return;
          setWorkspaceRun(null);
          setProject(mini.targetProjectId);
          setRun(mini.runId);
        }}
      />
    </div>
  );
}
