"use client";

import { EmptyState } from "@/components/primitives/EmptyState";
import { LoadingState } from "@/components/primitives/LoadingState";
import {
  WorkspaceTaskComposer,
} from "@/components/features/workspace/WorkspaceTaskComposer";
import { WorkspaceContextCard } from "@/components/features/workspace/WorkspaceContextCard";
import { useWorkspaceRunDetail } from "@/hooks/use-workspace-run-detail";
import { useProjects } from "@/hooks/use-projects";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { resolveWorkspacePlanningSelection } from "@/lib/workspace/workspace-run-lifecycle";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useMemo } from "react";

/**
 * Shell mínimo do workspace: nova atividade e estado idle.
 * Planeamento e execução operacional usam o mesmo RunViewShell das corridas individuais.
 */
export function WorkspaceRunViewShell() {
  const { t } = useI18n();
  const workspaceRunId = useMissionShellStore((s) => s.selectedWorkspaceRunId);
  const selectedWorkspaceId = useMissionShellStore((s) => s.selectedWorkspaceId);
  const selectedRunId = useMissionShellStore((s) => s.selectedRunId);
  const newActivityFlow = useMissionShellStore((s) => s.newActivityFlow);
  const { runQuery } = useWorkspaceRunDetail(workspaceRunId);
  const projectsQuery = useProjects();
  const workspacesQuery = useWorkspaces();

  const workspace = useMemo(
    () =>
      (workspacesQuery.data?.workspaces ?? []).find(
        (w) => w.workspaceId === selectedWorkspaceId,
      ) ?? null,
    [workspacesQuery.data?.workspaces, selectedWorkspaceId],
  );

  if (selectedRunId) {
    return null;
  }

  if (!workspaceRunId && selectedWorkspaceId && newActivityFlow) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            {t("workspaceRun.newActivityTitle")}
          </h1>
          {workspace ? (
            <WorkspaceContextCard
              workspace={workspace}
              allProjects={projectsQuery.data?.projects ?? []}
            />
          ) : null}
          <WorkspaceTaskComposer workspaceId={selectedWorkspaceId} />
        </div>
      </div>
    );
  }

  if (!workspaceRunId && selectedWorkspaceId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          {workspace ? (
            <WorkspaceContextCard
              workspace={workspace}
              allProjects={projectsQuery.data?.projects ?? []}
            />
          ) : null}
          <EmptyState
            icon={Layers}
            title={t("workspaceRun.idleTitle")}
            hint={t("workspaceRun.idleHint")}
            className="py-8"
          />
          <div className="flex justify-center">
            <Button
              type="button"
              size="sm"
              onClick={() =>
                useMissionShellStore
                  .getState()
                  .beginNewActivityForWorkspace(selectedWorkspaceId)
              }
            >
              {t("workspaceRun.startActivity")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!workspaceRunId) {
    return (
      <EmptyState
        icon={Layers}
        title={t("workspaceRun.selectTitle")}
        hint={t("workspaceRun.selectHint")}
        className="m-6"
      />
    );
  }

  if (runQuery.isLoading) {
    return <LoadingState className="m-6" />;
  }

  const planning = resolveWorkspacePlanningSelection(runQuery.data);
  if (planning) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-2xl">
        <EmptyState
          icon={Layers}
          title={t("workspaceRun.unavailableTitle")}
          hint={t("workspaceRun.planningLinkMissing")}
          className="py-8"
        />
      </div>
    </div>
  );
}
