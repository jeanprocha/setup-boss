"use client";

import { Button } from "@/components/ui/button";
import type { MiniActivityDto } from "@/lib/api/mini-activity-types";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";
import type { useWorkspaceRunMutations } from "@/hooks/use-workspace-run-mutations";
import {
  dependencyStepLabels,
  groupMiniActivitiesByProject,
  labelWorkspaceMiniVisualState,
  projectDisplayName,
  resolveWorkspaceMiniVisualState,
} from "@/lib/workspace/workspace-mini-activity-operational";
import { cn } from "@/lib/utils";
import { ExternalLink, Loader2, RotateCcw, SkipForward } from "lucide-react";
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n/use-i18n";

const BADGE_CLASS: Record<string, string> = {
  pending: "execution-mini-timeline__badge--neutral",
  ready: "execution-mini-timeline__badge--primary",
  running: "execution-mini-timeline__badge--primary",
  waiting: "execution-mini-timeline__badge--warning",
  completed: "execution-mini-timeline__badge--success",
  failed: "execution-mini-timeline__badge--danger",
  skipped: "execution-mini-timeline__badge--neutral",
};

export function WorkspaceMiniActivityOperationalTimeline({
  miniActivities,
  projectsById,
  activeMiniActivityId,
  mutations,
  onOpenChildRun,
}: {
  miniActivities: MiniActivityDto[];
  projectsById: Map<string, ProjectSummaryDto>;
  activeMiniActivityId: string | null;
  mutations: ReturnType<typeof useWorkspaceRunMutations>;
  onOpenChildRun?: (mini: MiniActivityDto) => void;
}) {
  const { t } = useI18n();
  const orderById = useMemo(
    () => new Map(miniActivities.map((m) => [m.miniActivityId, m.order + 1])),
    [miniActivities],
  );
  const groups = useMemo(
    () => groupMiniActivitiesByProject(miniActivities),
    [miniActivities],
  );

  if (!miniActivities.length) {
    return (
      <p className="text-[12px] text-muted-foreground">
        {t("workspaceRun.activitiesPending")}
      </p>
    );
  }

  return (
    <section
      className="rounded-xl border border-border/70 bg-card/80 px-3.5 py-3 shadow-sm"
      aria-label={t("workspaceRun.executionTrackTitle")}
    >
      <header className="execution-mini-timeline__header">
        <h3 className="execution-mini-timeline__title">
          {t("workspaceRun.executionTrackTitle")}
        </h3>
        <span className="execution-mini-timeline__mode">
          {t("workspaceRun.executionTrackMode")}
        </span>
      </header>

      <div className="space-y-4">
        {[...groups.entries()].map(([projectId, minis]) => (
          <div key={projectId}>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("workspaceRun.projectLabel")}{" "}
              <span className="normal-case text-foreground/90">
                {projectDisplayName(projectId, projectsById)}
              </span>
            </p>
            <ol className="execution-mini-timeline">
              {minis.map((mini) => (
                <WorkspaceMiniStep
                  key={mini.miniActivityId}
                  mini={mini}
                  isActive={mini.miniActivityId === activeMiniActivityId}
                  dependencyLabels={dependencyStepLabels(mini, orderById)}
                  mutations={mutations}
                  onOpenChildRun={
                    mini.runId && onOpenChildRun
                      ? () => onOpenChildRun(mini)
                      : undefined
                  }
                />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkspaceMiniStep({
  mini,
  isActive,
  dependencyLabels,
  mutations,
  onOpenChildRun,
}: {
  mini: MiniActivityDto;
  isActive: boolean;
  dependencyLabels: string[];
  mutations: ReturnType<typeof useWorkspaceRunMutations>;
  onOpenChildRun?: () => void;
}) {
  const visual = resolveWorkspaceMiniVisualState(mini);
  const retryable = ["failed", "waiting_user_action", "cancelled"].includes(mini.status);
  const skippable = !["completed", "skipped"].includes(mini.status);

  return (
    <li
      className={cn(
        "execution-mini-timeline__item",
        isActive && "execution-mini-timeline__item--active",
      )}
    >
      <div className="execution-mini-timeline__row">
        <span className="execution-mini-timeline__index">{mini.order + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="execution-mini-timeline__step-title">{mini.title}</p>
            <span
              className={cn(
                "execution-mini-timeline__badge",
                BADGE_CLASS[visual] ?? BADGE_CLASS.pending,
              )}
            >
              {labelWorkspaceMiniVisualState(visual)}
            </span>
          </div>
          {mini.description ? (
            <p className="execution-mini-timeline__objective">{mini.description}</p>
          ) : null}
          {dependencyLabels.length > 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Depende de: {dependencyLabels.join(", ")}
            </p>
          ) : null}
          {(retryable || skippable || onOpenChildRun) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {onOpenChildRun ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-[10px]"
                  onClick={onOpenChildRun}
                >
                  <ExternalLink className="size-3" aria-hidden />
                  Ver corrida
                </Button>
              ) : null}
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
                  Repetir
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
                  Ignorar
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
