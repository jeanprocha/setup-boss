"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useWorkspaceRuns } from "@/hooks/use-workspace-runs";
import { useWorkspaceMutations } from "@/hooks/use-workspace-mutations";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { ConfirmDangerDialog } from "@/components/primitives/ConfirmDangerDialog";
import {
  WorkspaceFormDialog,
  type WorkspaceFormMode,
} from "@/components/features/workspace/WorkspaceFormDialog";
import { WorkspaceOverflowMenu } from "@/components/features/workspace/WorkspaceOverflowMenu";
import {
  projectsByIdMap,
  resolveProjectsForWorkspace,
} from "@/lib/workspace/partition-projects-by-workspace";
import type { SetupWorkspaceDto } from "@/lib/api/workspace-types";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";

function WorkspaceRunsList({ workspaceId }: { workspaceId: string }) {
  const runsQuery = useWorkspaceRuns(workspaceId);
  const selectedWorkspaceRunId = useMissionShellStore((s) => s.selectedWorkspaceRunId);
  const activateWorkspaceRunSelection = useMissionShellStore(
    (s) => s.activateWorkspaceRunSelection,
  );
  const { t } = useI18n();

  const runs = runsQuery.data ?? [];

  return (
    <div className="pb-1 pt-0.5">
      <p className="px-4 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/80">
        {t("workspaceRun.activitiesSection")}
      </p>
      {runsQuery.isLoading ? (
        <p className="px-4 py-1 text-[10px] text-muted-foreground">
          {t("workspace.loadingRuns")}
        </p>
      ) : !runs.length ? (
        <p className="px-4 py-1 text-[10px] text-muted-foreground">
          {t("workspace.noWorkspaceActivities")}
        </p>
      ) : (
        <ul>
          {runs.map((run) => {
            const active = selectedWorkspaceRunId === run.workspaceRunId;
            return (
              <li key={run.workspaceRunId}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-1.5 px-4 py-1.5 text-left text-[11px] transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent/50",
                  )}
                  onClick={() => activateWorkspaceRunSelection(workspaceId, run)}
                >
                  <span className="min-w-0 flex-1 truncate">{run.title}</span>
                  <span className="shrink-0 text-[9px] uppercase text-muted-foreground">
                    {run.status}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function WorkspaceProjectsMeta({
  projects,
}: {
  projects: ProjectSummaryDto[];
}) {
  const { t } = useI18n();
  if (!projects.length) {
    return (
      <p className="px-4 py-0.5 text-[10px] text-muted-foreground">
        {t("workspace.noProjectsInWorkspace")}
      </p>
    );
  }
  const labels = projects
    .map((p) => p.displayName?.trim() || p.id)
    .join(", ");
  return (
    <p
      className="px-4 py-0.5 text-[10px] leading-snug text-muted-foreground"
      title={labels}
    >
      {t("workspace.participantProjects", { count: projects.length })}
      {": "}
      <span className="text-foreground/75">{labels}</span>
    </p>
  );
}

function WorkspaceRow({
  workspace,
  projectsInWorkspace,
  allProjects,
}: {
  workspace: SetupWorkspaceDto;
  projectsInWorkspace: ProjectSummaryDto[];
  allProjects: ProjectSummaryDto[];
}) {
  const { t } = useI18n();
  const expanded = useMissionShellStore((s) =>
    s.expandedWorkspaceIds.includes(workspace.workspaceId),
  );
  const toggle = useMissionShellStore((s) => s.toggleWorkspaceExpanded);
  const selectedWorkspaceId = useMissionShellStore((s) => s.selectedWorkspaceId);
  const setSelectedWorkspace = useMissionShellStore((s) => s.setSelectedWorkspace);
  const beginNewActivity = useMissionShellStore((s) => s.beginNewActivityForWorkspace);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const mutations = useWorkspaceMutations();
  const [formError, setFormError] = useState<string | null>(null);

  const projectCount = projectsInWorkspace.length;

  return (
    <div className="border-b border-sidebar-border/25">
      <div className="flex min-h-[32px] items-center gap-0.5 px-1">
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent/30"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            toggle(workspace.workspaceId);
          }}
        >
          <ChevronRight
            className={cn(
              "size-3 transition-transform",
              expanded && "rotate-90",
            )}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 py-2 pr-0 text-left text-[11px] font-medium",
            selectedWorkspaceId === workspace.workspaceId
              ? "text-sidebar-accent-foreground"
              : "text-sidebar-foreground/90 hover:bg-sidebar-accent/40",
          )}
          onClick={() => {
            if (!expanded) toggle(workspace.workspaceId);
            setSelectedWorkspace(workspace.workspaceId);
          }}
        >
          <Layers className="size-3 shrink-0 opacity-70" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
          {projectCount > 0 ? (
            <span
              className="shrink-0 rounded bg-muted/50 px-1 text-[9px] tabular-nums text-muted-foreground"
              title={t("workspace.projectCountBadge", { count: projectCount })}
            >
              {projectCount}
            </span>
          ) : null}
        </button>
        <WorkspaceOverflowMenu
          onEdit={() => {
            setFormError(null);
            setEditOpen(true);
          }}
          onDelete={() => setConfirmDelete(true)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-6 shrink-0 text-muted-foreground hover:bg-sidebar-accent/35"
          title={t("workspaceRun.newActivity")}
          aria-label={t("workspaceRun.newActivity")}
          onClick={(e) => {
            e.stopPropagation();
            beginNewActivity(workspace.workspaceId);
          }}
        >
          <Plus className="size-3" />
        </Button>
      </div>

      {expanded ? (
        <div className="pb-1">
          <WorkspaceProjectsMeta projects={projectsInWorkspace} />
          <WorkspaceRunsList workspaceId={workspace.workspaceId} />
        </div>
      ) : null}

      <WorkspaceFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode={{ kind: "edit", workspace }}
        projects={allProjects}
        busy={mutations.update.isPending}
        errorMessage={formError}
        onSubmit={async (payload) => {
          setFormError(null);
          try {
            await mutations.update.mutateAsync({
              workspaceId: workspace.workspaceId,
              patch: payload,
            });
            setEditOpen(false);
          } catch (e) {
            setFormError(
              mutations.mutationErrorMessage(e, t("workspace.saveFailed")),
            );
          }
        }}
      />

      <ConfirmDangerDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("workspace.deleteTitle")}
        description={t("workspace.deleteDescription", { name: workspace.name })}
        confirmLabel={t("workspace.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        loading={mutations.remove.isPending}
        onConfirm={async () => {
          try {
            await mutations.remove.mutateAsync(workspace.workspaceId);
            setConfirmDelete(false);
          } catch (e) {
            window.alert(
              mutations.mutationErrorMessage(e, t("workspace.deleteFailed")),
            );
          }
        }}
      />
    </div>
  );
}

export function WorkspaceSidebarSection({
  allProjects,
  createDialogOpen: createDialogOpenProp,
  onCreateDialogOpenChange,
}: {
  allProjects: ProjectSummaryDto[];
  createDialogOpen?: boolean;
  onCreateDialogOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const workspacesQuery = useWorkspaces();
  const [createOpenInternal, setCreateOpenInternal] = useState(false);
  const createOpen = createDialogOpenProp ?? createOpenInternal;
  const setCreateOpen = onCreateDialogOpenChange ?? setCreateOpenInternal;
  const [formError, setFormError] = useState<string | null>(null);
  const mutations = useWorkspaceMutations();

  const workspaces = useMemo(
    () => workspacesQuery.data?.workspaces ?? [],
    [workspacesQuery.data?.workspaces],
  );

  const projectsById = useMemo(() => projectsByIdMap(allProjects), [allProjects]);

  if (!reachable) return null;

  const openCreate = () => {
    setFormError(null);
    setCreateOpen(true);
  };

  return (
    <>
      <div className="shrink-0 border-b border-sidebar-border/50">
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-sidebar-border/40 px-2">
          <Layers className="size-3 shrink-0 text-muted-foreground/80" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide text-sidebar-foreground/80">
            {t("workspace.sectionTitle")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0 text-muted-foreground hover:bg-sidebar-accent/35"
            title={t("workspace.createTitle")}
            aria-label={t("workspace.createTitle")}
            onClick={openCreate}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        {workspacesQuery.isLoading ? (
          <p className="px-2 py-2 text-[10px] text-muted-foreground">
            {t("workspace.loading")}
          </p>
        ) : !workspaces.length ? (
          <div className="space-y-1 px-2 py-2">
            <p className="text-[10px] text-muted-foreground">{t("workspace.empty")}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 w-full text-[11px]"
              onClick={openCreate}
            >
              {t("workspace.createTitle")}
            </Button>
          </div>
        ) : (
          workspaces.map((ws) => (
            <WorkspaceRow
              key={ws.workspaceId}
              workspace={ws}
              allProjects={allProjects}
              projectsInWorkspace={resolveProjectsForWorkspace(ws, projectsById)}
            />
          ))
        )}
      </div>

      <WorkspaceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode={{ kind: "create" } satisfies WorkspaceFormMode}
        projects={allProjects}
        busy={mutations.create.isPending}
        errorMessage={formError}
        onSubmit={async (payload) => {
          setFormError(null);
          try {
            await mutations.create.mutateAsync(payload);
            setCreateOpen(false);
          } catch (e) {
            setFormError(
              mutations.mutationErrorMessage(e, t("workspace.saveFailed")),
            );
          }
        }}
      />
    </>
  );
}
