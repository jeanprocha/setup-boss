"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/primitives/EmptyState";
import { LoadingState } from "@/components/primitives/LoadingState";
import { RuntimeCard } from "@/components/primitives/RuntimeCard";
import { AddProjectDialog } from "@/components/features/projects/AddProjectDialog";
import { ProjectsNewMenu } from "@/components/features/projects/ProjectsNewMenu";
import { useAddProjectFlow } from "@/hooks/use-add-project-flow";
import { useProjects } from "@/hooks/use-projects";
import { useRuns } from "@/hooks/use-runs";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { cn } from "@/lib/utils";
import { useMissionLayoutStore } from "@/stores/mission-layout-store";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { useI18n } from "@/lib/i18n/use-i18n";
import { AlertCircle, FolderGit2, Inbox, RefreshCw, ServerOff } from "lucide-react";

function projectInitial(displayName: string) {
  const letters = displayName.replace(/[^a-zA-Z0-9]/g, "");
  return (letters.slice(0, 2) || "??").toUpperCase();
}

function RunsList({
  selectedProjectId,
  runs,
  selectedRunId,
  reachable,
  setRun,
}: {
  selectedProjectId: string | null;
  runs: RunSummaryDto[];
  selectedRunId: string | null;
  reachable: boolean;
  setRun: (id: string | null) => void;
}) {
  const { t } = useI18n();
  if (!selectedProjectId) {
    return (
      <EmptyState
        icon={Inbox}
        title={t("sidebar.runsNoProjectTitle")}
        hint={t("sidebar.runsNoProjectHint")}
        className="py-6"
      />
    );
  }
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={t("sidebar.runsEmptyTitle")}
        hint={
          reachable
            ? t("sidebar.runsEmptyHintOnline")
            : t("sidebar.runsEmptyHintOffline")
        }
        className="py-6"
      />
    );
  }
  return (
    <div className="space-y-1.5">
      {runs.map((run) => (
        <RuntimeCard
          key={run.id}
          variant="run"
          run={run}
          selected={
            run.id === selectedRunId ||
            (run.runId != null && run.runId === selectedRunId)
          }
          onSelect={() => setRun(run.runId ?? run.id)}
        />
      ))}
    </div>
  );
}

export function ProjectSidebar() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const compact = useMissionLayoutStore((s) => s.sidebarCompact);
  const selectedProjectId = useMissionShellStore((s) => s.selectedProjectId);
  const selectedRunId = useMissionShellStore((s) => s.selectedRunId);
  const setProject = useMissionShellStore((s) => s.setSelectedProject);
  const setRun = useMissionShellStore((s) => s.setSelectedRun);

  const pq = useProjects();
  const rq = useRuns(selectedProjectId);
  const connection = useRuntimeConnectionStore((s) => s.connection);

  const projects = useMemo(() => pq.data?.projects ?? [], [pq.data?.projects]);
  const runs = useMemo(() => rq.data?.summaries ?? [], [rq.data?.summaries]);
  const loading = pq.isPending || (Boolean(selectedProjectId) && rq.isPending);
  const dataSource = pq.data?.source ?? "offline";
  const loadError = pq.data?.source === "error";
  const projectsErrorMessage = pq.data?.errorMessage;

  const onRefreshProjects = () => {
    void qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
  };

  const { addProjectDialogProps, openAddProjectDialog } =
    useAddProjectFlow(onRefreshProjects);

  const sourceBadge =
    dataSource === "runtime"
      ? t("sidebar.dataSourceLive")
      : dataSource === "error"
        ? t("sidebar.dataSourceError")
        : t("sidebar.dataSourceOffline");

  useEffect(() => {
    if (!projects.length) {
      if (selectedProjectId) setProject(null);
      return;
    }
    const ids = projects.map((p) => p.id);
    if (!selectedProjectId || !ids.includes(selectedProjectId)) {
      setProject(ids[0] ?? null);
    }
  }, [projects, selectedProjectId, setProject]);

  useEffect(() => {
    if (!selectedProjectId) {
      if (selectedRunId) setRun(null);
      return;
    }
    if (!runs.length) {
      if (selectedRunId) setRun(null);
      return;
    }
    const valid = runs.some(
      (r) =>
        r.id === selectedRunId ||
        (r.runId != null && r.runId === selectedRunId),
    );
    if (!selectedRunId || !valid) {
      const first = runs[0];
      setRun(first ? (first.runId ?? first.id) : null);
    }
  }, [runs, selectedProjectId, selectedRunId, setRun]);

  if (compact) {
    const runsForProject = runs.filter((r) => r.projectId === selectedProjectId);
    return (
      <aside className="flex w-14 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-12 shrink-0 items-center justify-center border-b border-sidebar-border">
          <FolderGit2 className="size-4 text-sidebar-primary" />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col items-center gap-1.5 py-2">
            {projects.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="ghost"
                size="icon"
                title={p.displayName}
                className={cn(
                  "size-9 rounded-md font-mono text-[10px]",
                  p.id === selectedProjectId &&
                    "bg-sidebar-accent text-sidebar-accent-foreground ring-2 ring-[rgb(var(--v-theme-primary))]/55",
                )}
                onClick={() => {
                  setProject(p.id);
                  const first = runs.find((r) => r.projectId === p.id);
                  setRun(first ? (first.runId ?? first.id) : null);
                }}
              >
                {projectInitial(p.displayName)}
              </Button>
            ))}
          </div>
          <Separator className="my-1 bg-sidebar-border" />
          <div className="flex flex-col items-center gap-1 px-1 pb-2">
            {runsForProject.slice(0, 5).map((run) => (
              <Button
                key={run.id}
                type="button"
                variant="ghost"
                size="icon"
                title={run.id}
                className={cn(
                  "size-2.5 rounded-full p-0",
                  run.id === selectedRunId ||
                    (run.runId != null && run.runId === selectedRunId)
                    ? "bg-[rgb(var(--v-theme-primary))] ring-2 ring-[rgb(var(--v-theme-primary))]/50"
                    : "bg-muted-foreground/35 hover:bg-muted-foreground/55",
                )}
                onClick={() => setRun(run.runId ?? run.id)}
              />
            ))}
          </div>
        </ScrollArea>
      </aside>
    );
  }

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <AddProjectDialog {...addProjectDialogProps} />
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-sidebar-border px-2.5">
        <FolderGit2 className="size-4 shrink-0 text-sidebar-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">
          {t("sidebar.operationsHeader")}
        </span>
        <Badge variant="outline" className="ml-auto font-mono text-[9px] uppercase">
          {sourceBadge}
        </Badge>
        {connection.degraded ? (
          <span
            className="text-[9px] font-medium uppercase text-amber-400"
            title={t("sidebar.degradedQueue")}
          >
            {t("sidebar.queueDegradedShort")}
          </span>
        ) : null}
        <ProjectsNewMenu
          gitRepoEnabled={connection.reachable}
          onAddGitRepository={() => openAddProjectDialog()}
        />
        {loading ? (
          <span className="size-2 rounded-full bg-sidebar-primary" />
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {loading ? <LoadingState /> : null}
        {!loading && loadError ? (
          <div className="space-y-3 p-3">
            <EmptyState
              icon={AlertCircle}
              title={t("sidebar.errorLoadProjects")}
              hint={
                projectsErrorMessage
                  ? t("sidebar.errorDetail", { detail: projectsErrorMessage })
                  : t("sidebar.errorConfirmRuntime")
              }
              className="py-8"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full gap-1.5"
              onClick={onRefreshProjects}
            >
              <RefreshCw className="size-3.5" />
              {t("common.update")}
            </Button>
          </div>
        ) : !loading && !projects.length ? (
          <EmptyState
            icon={connection.reachable ? Inbox : ServerOff}
            title={
              connection.reachable
                ? t("sidebar.emptyProjectsOnline")
                : t("sidebar.emptyProjectsOffline")
            }
            hint={
              connection.reachable
                ? t("sidebar.hintProjectsOnline")
                : t("sidebar.hintProjectsOffline")
            }
            className="m-2 py-10"
          />
        ) : (
          <div className="space-y-0.5 p-2">
            <p className="px-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("sidebar.projects")}
            </p>
            {projects.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant={p.id === selectedProjectId ? "secondary" : "ghost"}
                size="sm"
                className="h-auto w-full justify-start gap-2 rounded-sm px-2 py-1.5"
                onClick={() => {
                  setProject(p.id);
                  const first = runs.find((r) => r.projectId === p.id);
                  setRun(first ? (first.runId ?? first.id) : null);
                }}
              >
                <span className="truncate text-left text-[13px] font-medium leading-none">
                  {p.displayName}
                </span>
              </Button>
            ))}
          </div>
        )}
        <Separator className="bg-sidebar-border" />
        <div className="space-y-2 p-2">
          <p className="px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("sidebar.runsSection")}
          </p>
          <RunsList
            selectedProjectId={selectedProjectId}
            runs={runs}
            selectedRunId={selectedRunId}
            reachable={connection.reachable}
            setRun={setRun}
          />
        </div>
      </ScrollArea>
    </aside>
  );
}
