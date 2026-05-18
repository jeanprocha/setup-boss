"use client";

import {
  useMutation,
  useQueries,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/primitives/EmptyState";
import { MenuClickAwayOverlay } from "@/components/primitives/MenuClickAwayOverlay";
import { ConfirmDangerDialog } from "@/components/primitives/ConfirmDangerDialog";
import { AddProjectDialog } from "@/components/features/projects/AddProjectDialog";
import { ProjectOverflowMenu } from "@/components/features/projects/ProjectOverflowMenu";
import { ProjectRenameDialog } from "@/components/features/projects/ProjectRenameDialog";
import { useProjectDisplayAliases } from "@/hooks/use-project-display-aliases";
import { ProjectsNewMenu } from "@/components/features/projects/ProjectsNewMenu";
import { WorkspaceSidebarSection } from "@/components/features/workspace/WorkspaceSidebarSection";
import { SidebarProjectBlock } from "@/components/features/projects/SidebarProjectBlock";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useAddProjectFlow } from "@/hooks/use-add-project-flow";
import { useProjects } from "@/hooks/use-projects";
import { projectRunsQueryOptions, type RunsQueryResult } from "@/hooks/use-runs";
import { clearCachedProjectRuns } from "@/lib/runtime/shell/mission-sidebar-cache";
import { pickRunSummaries } from "@/lib/runtime/shell/pick-run-summaries";
import { useSidebarWidth } from "@/hooks/use-sidebar-width";
import {
  MAX_PINNED_RUNS_PER_PROJECT,
  useProjectPinnedRuns,
} from "@/hooks/use-project-pinned-runs";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useMissionTheme } from "@/app/providers";
import {
  runMatchesSelectionKey,
  runSelectionKey,
} from "@/lib/runtime/run-selection";
import { useMissionLayoutStore } from "@/stores/mission-layout-store";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import type { ProjectSummaryDto, RunSummaryDto } from "@/lib/api/runtime-types";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { refetchRunReadModels } from "@/lib/runtime/orchestration/refetch-run-read-models";
import { postArchiveRun, postDeleteRun, deleteRuntimeProject } from "@/lib/api/runtime-api";
import { isRuntimeApiError } from "@/lib/api/runtime-errors";
import {
  formatRunDisplayTitle,
  runTechnicalTooltip,
} from "@/lib/runtime/format-display";
import { runSummaryStatusLabel } from "@/lib/runtime/adapters/runtime-labels";
import type { RuntimeUiState } from "@/lib/runtime/runtime-ui-types";
import {
  AlertCircle,
  ChevronRight,
  FolderGit2,
  Inbox,
  MoreHorizontal,
  Pin,
  Plug,
  Plus,
  RefreshCw,
  ServerOff,
  Settings2,
  Trash2,
} from "lucide-react";

const ACTIVITIES_LIST_INITIAL = 18;
const ACTIVITIES_LIST_PAGE_MORE = 8;

function ActivityRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1 py-1 pl-3 pr-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-7 animate-pulse rounded-md bg-muted/35"
          style={{ width: `${68 + (i % 3) * 10}%` }}
        />
      ))}
    </div>
  );
}

function projectInitial(displayName: string) {
  const tail = displayName.replace(/[^a-zA-Z0-9]/g, "");
  return (tail.slice(0, 2) || "??").toUpperCase();
}

function visibleRunsLimit(
  limits: Record<string, number>,
  projectId: string,
): number {
  return limits[projectId] ?? ACTIVITIES_LIST_INITIAL;
}

function operatorInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? "";
    const b = parts[parts.length - 1]?.[0] ?? "";
    return `${a}${b}`.toUpperCase() || "??";
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return parts[0]?.slice(0, 2).toUpperCase() || "??";
}

function OperatorOptionsDropdown({
  align,
  open,
  setOpen,
  showArchived,
  setShowArchived,
}: {
  align: "left" | "right";
  open: boolean;
  setOpen: (next: boolean) => void;
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
}) {
  const { t, locale, setLocale } = useI18n();
  const { dark, toggleTheme } = useMissionTheme();
  const setMainWorkspaceView = useMissionShellStore(
    (s) => s.setMainWorkspaceView,
  );

  const setLight = () => {
    if (dark) toggleTheme();
  };
  const setDark = () => {
    if (!dark) toggleTheme();
  };

  return (
    <div className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8 shrink-0 cursor-pointer text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        title={t("sidebar.optionsMenuAria")}
        aria-label={t("sidebar.optionsMenuAria")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <Settings2 className="size-4" />
      </Button>
      {open ? (
        <>
          <MenuClickAwayOverlay onDismiss={() => setOpen(false)} />
          <div
            role="menu"
            className={cn(
              "absolute bottom-full z-40 mb-1 min-w-[12.5rem] rounded-md border border-border bg-popover p-2 shadow-md",
              align === "right" ? "right-0" : "left-0",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <label className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1.5 text-[11px] hover:bg-accent">
              <input
                type="checkbox"
                className="accent-primary"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <span>{t("sidebar.menuShowArchivedActivities")}</span>
            </label>

            <div className="mt-2 border-t border-border pt-2">
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-sm px-1 py-1.5 text-left text-[11px] hover:bg-accent"
                onClick={() => {
                  setOpen(false);
                  setMainWorkspaceView("connections");
                }}
              >
                <Plug className="size-3.5 shrink-0 opacity-80" aria-hidden />
                {t("sidebar.menuConnections")}
              </button>
            </div>

            <div className="mt-2 border-t border-border pt-2">
              <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("sidebar.menuTheme")}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-[10px] transition-colors",
                    !dark
                      ? "border-transparent bg-sidebar-accent/80 font-medium text-sidebar-foreground"
                      : "border-transparent bg-muted/40 hover:bg-accent",
                  )}
                  onClick={() => setLight()}
                >
                  {t("chrome.themeLight")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-[10px] transition-colors",
                    dark
                      ? "border-transparent bg-sidebar-accent/80 font-medium text-sidebar-foreground"
                      : "border-transparent bg-muted/40 hover:bg-accent",
                  )}
                  onClick={() => setDark()}
                >
                  {t("chrome.themeDark")}
                </button>
              </div>
            </div>

            <div className="mt-2 border-t border-border pt-2">
              <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("sidebar.menuLanguage")}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-[10px] transition-colors",
                    locale === "pt-BR"
                      ? "border-transparent bg-sidebar-accent/80 font-medium text-sidebar-foreground"
                      : "border-transparent bg-muted/40 hover:bg-accent",
                  )}
                  onClick={() => setLocale("pt-BR")}
                >
                  {t("sidebar.menuLangPtBr")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-[10px] transition-colors",
                    locale === "en"
                      ? "border-transparent bg-sidebar-accent/80 font-medium text-sidebar-foreground"
                      : "border-transparent bg-muted/40 hover:bg-accent",
                  )}
                  onClick={() => setLocale("en")}
                >
                  {t("sidebar.menuLangEn")}
                </button>
              </div>
            </div>

            <div className="mt-2 border-t border-border pt-2">
              <span className="block px-1 text-[11px] text-muted-foreground">
                {t("sidebar.signOut")}
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ProjectActivitySidebar() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { widthPx, setWidthPx, resetWidth } = useSidebarWidth();

  const operatorDisplayName =
    process.env.NEXT_PUBLIC_MC_OPERATOR_DISPLAY_NAME?.trim() ||
    t("common.operatorLocal");

  const compact = useMissionLayoutStore((s) => s.sidebarCompact);
  const selectedProjectId = useMissionShellStore((s) => s.selectedProjectId);
  const selectedRunId = useMissionShellStore((s) => s.selectedRunId);
  const setProject = useMissionShellStore((s) => s.setSelectedProject);
  const setRun = useMissionShellStore((s) => s.setSelectedRun);
  const newActivityFlow = useMissionShellStore((s) => s.newActivityFlow);
  const beginNewActivity = useMissionShellStore(
    (s) => s.beginNewActivityForProject,
  );

  const [showArchived, setShowArchived] = useState(false);
  const expandedProjectIds = useMissionShellStore((s) => s.expandedProjectIds);
  const toggleProjectExpandedStore = useMissionShellStore(
    (s) => s.toggleProjectExpanded,
  );
  const ensureProjectExpanded = useMissionShellStore(
    (s) => s.ensureProjectExpanded,
  );
  const [footerOptionsOpen, setFooterOptionsOpen] = useState(false);
  const [confirmArchiveRun, setConfirmArchiveRun] = useState<string | null>(
    null,
  );
  const [confirmDeleteRun, setConfirmDeleteRun] = useState<{
    runKey: string;
    projectId: string;
  } | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [renameProject, setRenameProject] = useState<{
    id: string;
    serverName: string;
  } | null>(null);
  const [visibleRunLimits, setVisibleRunLimits] = useState<
    Record<string, number>
  >({});
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);

  const pq = useProjects();
  const wq = useWorkspaces();
  const connection = useRuntimeConnectionStore((s) => s.connection);
  const reachable = connection.reachable;

  const expandedProjectIdSet = useMemo(
    () => new Set(expandedProjectIds),
    [expandedProjectIds],
  );

  const workspaces = useMemo(
    () => wq.data?.workspaces ?? [],
    [wq.data?.workspaces],
  );

  const projectIdsForRuns = useMemo(() => {
    const ids = new Set<string>(expandedProjectIds);
    if (selectedProjectId) ids.add(selectedProjectId);
    return [...ids];
  }, [expandedProjectIds, selectedProjectId]);

  const runQueries = useQueries({
    queries: projectIdsForRuns.map((pid) => ({
      ...projectRunsQueryOptions(pid, showArchived, reachable),
      enabled: Boolean(pid),
    })),
  });

  useEffect(() => {
    if (!selectedProjectId) return;
    ensureProjectExpanded(selectedProjectId);
  }, [selectedProjectId, ensureProjectExpanded]);

  const runsByProject = useMemo(() => {
    const map = new Map<string, RunSummaryDto[]>();
    projectIdsForRuns.forEach((pid, i) => {
      map.set(pid, pickRunSummaries(runQueries[i]));
    });
    return map;
  }, [projectIdsForRuns, runQueries]);

  const runs = useMemo(
    () =>
      selectedProjectId
        ? (runsByProject.get(selectedProjectId) ?? [])
        : [],
    [selectedProjectId, runsByProject],
  );

  const allLoadedRuns = useMemo(
    () => runQueries.flatMap((q) => pickRunSummaries(q)),
    [runQueries],
  );

  const runsQueryState = useCallback(
    (projectId: string) => {
      const idx = projectIdsForRuns.indexOf(projectId);
      if (idx < 0) return { loading: false, error: false };
      const q = runQueries[idx];
      const summaries = q ? pickRunSummaries(q) : [];
      return {
        loading: Boolean(
          q &&
            (q.isPending || (q.isFetching && !q.isFetched)) &&
            summaries.length === 0,
        ),
        error: Boolean(q?.isError && summaries.length === 0),
      };
    },
    [projectIdsForRuns, runQueries],
  );

  const toggleProjectExpanded = useCallback(
    (projectId: string) => {
      const wasExpanded = expandedProjectIdSet.has(projectId);
      toggleProjectExpandedStore(projectId);
      if (wasExpanded) {
        setVisibleRunLimits((prev) => {
          if (!(projectId in prev)) return prev;
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
      }
    },
    [expandedProjectIdSet, toggleProjectExpandedStore],
  );

  const loadMoreProjectRuns = useCallback((projectId: string) => {
    setVisibleRunLimits((prev) => ({
      ...prev,
      [projectId]:
        (prev[projectId] ?? ACTIVITIES_LIST_INITIAL) + ACTIVITIES_LIST_PAGE_MORE,
    }));
  }, []);

  const archiveMut = useMutation({
    mutationFn: (runKey: string) => postArchiveRun(runKey),
  });

  const deleteMut = useMutation({
    mutationFn: (runKey: string) => postDeleteRun(runKey),
  });

  const deleteProjectMut = useMutation({
    mutationFn: (projectId: string) => deleteRuntimeProject(projectId),
  });

  const { aliases, labelFor, setAlias, clearAlias } =
    useProjectDisplayAliases();

  const { getPins, togglePin, clearPinsForProject } = useProjectPinnedRuns();

  const projects = useMemo(() => pq.data?.projects ?? [], [pq.data?.projects]);

  const activityProjectLabel = useMemo(() => {
    const run = allLoadedRuns.find((r) =>
      runMatchesSelectionKey(r, selectedRunId),
    );
    const pid = run?.projectId ?? selectedProjectId;
    if (!pid) return t("sidebar.noActivitySelected");
    const p = projects.find((x) => x.id === pid);
    return p ? labelFor(p.id, p.displayName?.trim() || "") : t("common.project");
  }, [allLoadedRuns, selectedRunId, selectedProjectId, projects, t, labelFor]);

  const projectsLoadError =
    pq.isError && projects.length === 0 && !pq.isPlaceholderData;
  const projectsErrorMessage =
    pq.error instanceof Error
      ? pq.error.message
      : pq.data?.source === "error"
        ? pq.data.errorMessage
        : undefined;

  const projectsInitialLoading =
    pq.isPending && pq.fetchStatus === "fetching" && projects.length === 0;
  const projectsListReady = pq.isFetched && !pq.isPending;

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!projectsListReady) return;
    if (projects.length === 0) return;
    if (!projects.some((p) => p.id === selectedProjectId)) {
      const fallback =
        newActivityFlow && projects.length > 0 ? projects[0]!.id : null;
      setProject(fallback);
      setRun(null);
    }
  }, [
    projects,
    projectsListReady,
    pq.isFetched,
    pq.isPending,
    pq.data?.source,
    selectedProjectId,
    newActivityFlow,
    setProject,
    setRun,
  ]);

  /** Alinha chave persistida (jobId vs runId) com o formato canónico da lista. */
  useEffect(() => {
    if (!selectedProjectId || !selectedRunId) return;
    const idx = projectIdsForRuns.indexOf(selectedProjectId);
    if (idx < 0) return;
    const q = runQueries[idx];
    if (!q?.data?.summaries?.length) return;
    const hit = q.data.summaries.find((r) =>
      runMatchesSelectionKey(r, selectedRunId),
    );
    if (!hit) return;
    const canonical = runSelectionKey(hit);
    if (canonical !== selectedRunId) setRun(canonical);
  }, [
    projectIdsForRuns,
    runQueries,
    selectedProjectId,
    selectedRunId,
    setRun,
  ]);


  const onRefreshProjects = () => {
    void qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
  };

  const onResizeMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startW = widthPx;
    const startX = e.clientX;
    document.body.style.cursor = "col-resize";
    const onMove = (ev: globalThis.MouseEvent) => {
      const dx = ev.clientX - startX;
      setWidthPx(startW + dx);
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleTogglePin = (
    projectId: string,
    runKey: string,
    validKeys: Set<string>,
  ) => {
    const res = togglePin(projectId, runKey, validKeys);
    if (!res.ok && res.reason === "max_pins") {
      window.alert(
        t("sidebar.maxPins", { max: MAX_PINNED_RUNS_PER_PROJECT }),
      );
    }
  };

  const renderProjectBlock = useCallback(
    (p: ProjectSummaryDto) => {
      const projectRuns = runsByProject.get(p.id) ?? [];
      const pinOrder = getPins(p.id);
      const runListLimit = visibleRunsLimit(visibleRunLimits, p.id);
      const rs = runsQueryState(p.id);

      return (
        <SidebarProjectBlock
          key={p.id}
          project={p}
          displayLabel={labelFor(p.id, p.displayName?.trim() || p.id)}
          activeProject={p.id === selectedProjectId}
          projectExpanded={expandedProjectIdSet.has(p.id)}
          projectRuns={projectRuns}
          pinOrder={pinOrder}
          runListLimit={runListLimit}
          runsQueryLoading={rs.loading}
          runsQueryError={rs.error}
          selectedRunId={selectedRunId}
          connectionReachable={connection.reachable}
          archivePending={archiveMut.isPending}
          deletePending={deleteMut.isPending}
          queryClient={qc}
          onToggleExpanded={() => toggleProjectExpanded(p.id)}
          onSelectProject={() => {
            setProject(p.id);
            setRun(null);
          }}
          onBeginNewActivity={() => beginNewActivity(p.id)}
          onRename={() =>
            setRenameProject({
              id: p.id,
              serverName: p.displayName?.trim() || p.id,
            })
          }
          onDeleteProject={() =>
            setConfirmDeleteProject({
              id: p.id,
              label: labelFor(p.id, p.displayName?.trim() || p.id),
            })
          }
          onSelectRun={(projectId, runKey) => {
            setProject(projectId);
            setRun(runKey);
          }}
          onTogglePin={(runKey, validRunKeys) =>
            handleTogglePin(p.id, runKey, validRunKeys)
          }
          onArchiveRequest={(runKey) => setConfirmArchiveRun(runKey)}
          onDeleteRequest={(runKey) =>
            setConfirmDeleteRun({ runKey, projectId: p.id })
          }
          onLoadMoreRuns={() => loadMoreProjectRuns(p.id)}
        />
      );
    },
    [
      runsByProject,
      getPins,
      visibleRunLimits,
      runsQueryState,
      selectedProjectId,
      expandedProjectIdSet,
      selectedRunId,
      connection.reachable,
      archiveMut.isPending,
      deleteMut.isPending,
      qc,
      toggleProjectExpanded,
      setProject,
      setRun,
      beginNewActivity,
      labelFor,
      handleTogglePin,
      loadMoreProjectRuns,
    ],
  );

  const { addProjectDialogProps, openAddProjectDialog } =
    useAddProjectFlow(onRefreshProjects);

  if (compact) {
    return (
      <aside className="flex w-14 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <AddProjectDialog {...addProjectDialogProps} />
        <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-sidebar-border px-1">
          <span className="size-1 shrink-0" aria-hidden />
          <FolderGit2 className="size-4 justify-self-center text-muted-foreground/85" />
          <div className="justify-self-end pr-0.5">
            <ProjectsNewMenu
              variant="compact"
              gitRepoEnabled={connection.reachable}
              onAddGitRepository={() => openAddProjectDialog()}
            />
          </div>
        </div>
        <ScrollArea className="min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]]:scroll-smooth">
          <div className="flex flex-col items-center gap-1.5 py-2">
            {projects.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="ghost"
                size="icon"
                title={p.technicalSummary ?? p.displayName}
                className={cn(
                  "size-8 cursor-pointer rounded-sm font-mono text-[9px]",
                  p.id === selectedProjectId &&
                    "bg-sidebar-accent/50 text-sidebar-foreground",
                )}
                onClick={() => {
                  setProject(p.id);
                  setRun(null);
                }}
              >
                {projectInitial(p.displayName)}
              </Button>
            ))}
          </div>
          <Separator className="my-1 bg-sidebar-border" />
          <div className="flex flex-col items-center gap-1 px-1 pb-2">
            {runs
              .filter((r) => r.projectId === selectedProjectId)
              .slice(0, 8)
              .map((run) => (
                <Button
                  key={run.id}
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={runTechnicalTooltip(run)}
                  className={cn(
                    "size-2.5 cursor-pointer rounded-full p-0",
                    runMatchesSelectionKey(run, selectedRunId)
                      ? "bg-sidebar-foreground/80 ring-1 ring-sidebar-foreground/25"
                      : "bg-muted-foreground/35 hover:bg-muted-foreground/55",
                    run.archived && "opacity-50",
                  )}
                  onClick={() => setRun(runSelectionKey(run))}
                />
              ))}
          </div>
        </ScrollArea>
        <div className="flex shrink-0 justify-center border-t border-sidebar-border px-1 py-2">
          <OperatorOptionsDropdown
            align="left"
            open={footerOptionsOpen}
            setOpen={setFooterOptionsOpen}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
          />
        </div>
      </aside>
    );
  }

  return (
    <div
      className="relative flex shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      style={{ width: widthPx }}
    >
      <aside className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AddProjectDialog {...addProjectDialogProps} />
        <ConfirmDangerDialog
          open={confirmArchiveRun != null}
          onOpenChange={(o) => {
            if (!o) setConfirmArchiveRun(null);
          }}
          title={t("sidebar.archiveActivityTitle")}
          description={t("sidebar.archiveConfirm")}
          confirmLabel={t("sidebar.archive")}
          cancelLabel={t("common.cancel")}
          confirmVariant="default"
          loading={archiveMut.isPending}
          onConfirm={() => {
            if (!confirmArchiveRun) return;
            archiveMut.mutate(confirmArchiveRun, {
              onSuccess: () => {
                void qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
                if (selectedRunId === confirmArchiveRun) setRun(null);
                setConfirmArchiveRun(null);
              },
              onError: () => setConfirmArchiveRun(null),
            });
          }}
        />
        <ConfirmDangerDialog
          open={confirmDeleteRun != null}
          onOpenChange={(o) => {
            if (!o) setConfirmDeleteRun(null);
          }}
          title={t("sidebar.deleteActivityTitle")}
          description={t("sidebar.deleteConfirm")}
          confirmLabel={t("sidebar.delete")}
          cancelLabel={t("common.cancel")}
          loading={deleteMut.isPending}
          onConfirm={() => {
            if (!confirmDeleteRun) return;
            const { runKey, projectId } = confirmDeleteRun;
            deleteMut.mutate(runKey, {
              onSuccess: () => {
                clearCachedProjectRuns(projectId, false);
                clearCachedProjectRuns(projectId, true);
                qc.setQueriesData(
                  {
                    queryKey: runtimeQueryKeys.projectRuns(projectId),
                  },
                  (old: RunsQueryResult | undefined) => {
                    if (!old) return old;
                    return {
                      ...old,
                      summaries: old.summaries.filter(
                        (r) => !runMatchesSelectionKey(r, runKey),
                      ),
                    };
                  },
                );
                void qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
                if (
                  selectedRunId &&
                  (selectedRunId === runKey ||
                    allLoadedRuns.some(
                      (r) =>
                        r.projectId === projectId &&
                        runMatchesSelectionKey(r, runKey) &&
                        runMatchesSelectionKey(r, selectedRunId),
                    ))
                ) {
                  setRun(null);
                }
                setConfirmDeleteRun(null);
              },
              onError: (e) => {
                const msg = isRuntimeApiError(e) ? e.message : String(e);
                window.alert(msg);
                setConfirmDeleteRun(null);
              },
            });
          }}
        />
        <ConfirmDangerDialog
          open={confirmDeleteProject != null}
          onOpenChange={(o) => {
            if (!o) setConfirmDeleteProject(null);
          }}
          title={t("sidebar.deleteProjectTitle")}
          description={
            confirmDeleteProject ? (
              <>
                <p className="font-medium text-foreground/95">
                  {confirmDeleteProject.label}
                </p>
                <p className="mt-2">{t("sidebar.deleteProjectDescription")}</p>
              </>
            ) : null
          }
          confirmLabel={t("sidebar.delete")}
          cancelLabel={t("common.cancel")}
          loading={deleteProjectMut.isPending}
          onConfirm={() => {
            if (!confirmDeleteProject) return;
            const pid = confirmDeleteProject.id;
            deleteProjectMut.mutate(pid, {
              onSuccess: () => {
                clearPinsForProject(pid);
                clearAlias(pid);
                void qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
                if (selectedProjectId === pid) {
                  setProject(null);
                  setRun(null);
                }
                setConfirmDeleteProject(null);
              },
              onError: (e) => {
                const blocked = isRuntimeApiError(e) && e.status === 409;
                window.alert(
                  blocked ? t("sidebar.deleteProjectBlocked") : isRuntimeApiError(e) ? e.message : String(e),
                );
                setConfirmDeleteProject(null);
              },
            });
          }}
        />
        <ProjectRenameDialog
          open={renameProject != null}
          onOpenChange={(o) => {
            if (!o) setRenameProject(null);
          }}
          projectId={renameProject?.id ?? ""}
          serverDisplayName={renameProject?.serverName ?? ""}
          initialNickname={
            renameProject ? (aliases[renameProject.id] ?? "") : ""
          }
          onSave={(id, nick) => setAlias(id, nick)}
        />
        <WorkspaceSidebarSection
          allProjects={projects}
          createDialogOpen={workspaceCreateOpen}
          onCreateDialogOpenChange={setWorkspaceCreateOpen}
        />
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-sidebar-border/50 px-2">
          <FolderGit2 className="size-3 shrink-0 text-muted-foreground/80" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide text-sidebar-foreground/80">
            {t("sidebar.projects")}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {connection.degraded ? (
              <span
                className="text-[8px] font-medium uppercase text-amber-800/90 dark:text-amber-400/90"
                title={t("sidebar.degradedQueue")}
              >
                {t("sidebar.queueDegradedShort")}
              </span>
            ) : null}
            <ProjectsNewMenu
              gitRepoEnabled={connection.reachable}
              onAddGitRepository={() => openAddProjectDialog()}
              onCreateWorkspace={() => setWorkspaceCreateOpen(true)}
            />
          </div>
        </div>
        <ScrollArea className="min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]]:scroll-smooth">
          {pq.isError && projects.length > 0 ? (
            <p className="mx-2 mb-1 mt-1 rounded border border-amber-500/30 bg-amber-500/8 px-2 py-1 text-[10px] leading-snug text-amber-900/90 dark:text-amber-100/90">
              Falha ao actualizar projectos — lista anterior mantida.
              {projectsErrorMessage ? ` (${projectsErrorMessage})` : null}
            </p>
          ) : null}
          {projectsInitialLoading ? (
            <div className="space-y-2 px-2 py-2">
              <div className="h-6 w-3/4 animate-pulse rounded bg-muted/40" />
              <ActivityRowsSkeleton rows={6} />
            </div>
          ) : projectsLoadError ? (
            <div className="space-y-2 px-2 py-2">
              <EmptyState
                icon={AlertCircle}
                title={t("sidebar.errorLoadProjects")}
                hint={
                  projectsErrorMessage
                    ? t("sidebar.errorDetail", {
                        detail: projectsErrorMessage,
                      })
                    : t("sidebar.errorConfirmRuntime")
                }
                className="py-4"
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
          ) : !projects.length && workspaces.length === 0 ? (
            <div className="space-y-3 p-3">
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
                className="py-4"
              />
              {!connection.reachable ? (
                <p className="text-center text-[10px] text-amber-900 dark:text-amber-200/90">
                  {t("sidebar.runtimeOfflineProjects")}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-sidebar-border/25">
              {projects.map((p) => renderProjectBlock(p))}
            </div>
          )}
        </ScrollArea>
        <footer className="shrink-0 border-t border-sidebar-border/50 px-2 py-1">
          <div className="flex items-center gap-1.5">
            <div
              className="flex size-6 shrink-0 items-center justify-center rounded-md border border-sidebar-border/40 bg-muted/50 text-[9px] font-semibold text-muted-foreground"
              aria-hidden
            >
              {operatorInitials(operatorDisplayName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium leading-tight text-sidebar-foreground">
                {operatorDisplayName}
              </p>
              <p
                className="truncate text-[10px] leading-tight text-muted-foreground/90"
                title={activityProjectLabel}
              >
                {activityProjectLabel}
              </p>
            </div>
            <OperatorOptionsDropdown
              align="right"
              open={footerOptionsOpen}
              setOpen={setFooterOptionsOpen}
              showArchived={showArchived}
              setShowArchived={setShowArchived}
            />
          </div>
        </footer>
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        title={t("sidebar.resizePanel")}
        onMouseDown={onResizeMouseDown}
        onDoubleClick={(e) => {
          e.preventDefault();
          resetWidth();
        }}
        className="absolute right-0 top-0 z-20 h-full w-1 shrink-0 cursor-col-resize select-none hover:bg-sidebar-primary/25"
      />
    </div>
  );
}
