"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MenuClickAwayOverlay } from "@/components/primitives/MenuClickAwayOverlay";
import { ProjectOverflowMenu } from "@/components/features/projects/ProjectOverflowMenu";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import {
  runMatchesSelectionKey,
  runSelectionKey,
} from "@/lib/runtime/run-selection";
import { refetchRunReadModels } from "@/lib/runtime/orchestration/refetch-run-read-models";
import {
  formatRunDisplayTitle,
  runTechnicalTooltip,
} from "@/lib/runtime/format-display";
import { runSummaryStatusLabel } from "@/lib/runtime/adapters/runtime-labels";
import type { RuntimeUiState } from "@/lib/runtime/runtime-ui-types";
import type { ProjectSummaryDto, RunSummaryDto } from "@/lib/api/runtime-types";
import {
  MAX_PINNED_RUNS_PER_PROJECT,
  sortRunsWithPins,
} from "@/hooks/use-project-pinned-runs";
import { ChevronRight, MoreHorizontal, Pin, Plus } from "lucide-react";

export function ActivityRowsSkeleton({ rows = 5 }: { rows?: number }) {
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

export function runStripeClass(state: RuntimeUiState): string {
  switch (state) {
    case "running":
      return "before:bg-sb-running";
    case "success":
    case "recovered":
      return "before:bg-sb-success";
    case "failed":
      return "before:bg-sb-failed";
    case "blocked":
      return "before:bg-sb-blocked";
    case "waiting_clarification_answers":
    case "waiting_approval":
      return "before:bg-amber-500";
    case "waiting_clarification_questions":
      return "before:bg-cyan-500";
    case "correcting":
    case "retrying":
      return "before:bg-sb-correcting";
    case "warning":
      return "before:bg-sb-warning";
    default:
      return "before:bg-muted-foreground/45";
  }
}

function RunOverflowMenu({
  runKey,
  isPinned,
  pinDisabled,
  onTogglePin,
  onArchiveRequest,
  onDeleteRequest,
  archiving,
  deleting,
}: {
  runKey: string;
  isPinned: boolean;
  pinDisabled: boolean;
  onTogglePin: () => void;
  onArchiveRequest: (runKey: string) => void;
  onDeleteRequest: (runKey: string) => void;
  archiving: boolean;
  deleting: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const actionsBusy = archiving || deleting;

  return (
    <div className="relative z-[2] flex shrink-0 items-center self-center pr-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-6 shrink-0 cursor-pointer text-muted-foreground hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground group-hover/activity-row:text-sidebar-foreground"
        disabled={actionsBusy}
        aria-label={t("sidebar.activityActions")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <MoreHorizontal className="size-3" />
      </Button>
      {open ? (
        <>
          <MenuClickAwayOverlay onDismiss={() => setOpen(false)} />
          <RunActivityOverflowDropdown
            runKey={runKey}
            isPinned={isPinned}
            pinDisabled={pinDisabled}
            onTogglePin={onTogglePin}
            onArchiveRequest={onArchiveRequest}
            onDeleteRequest={onDeleteRequest}
            actionsBusy={actionsBusy}
            setOpen={setOpen}
            t={t}
          />
        </>
      ) : null}
    </div>
  );
}

function RunActivityOverflowDropdown({
  runKey,
  isPinned,
  pinDisabled,
  onTogglePin,
  onArchiveRequest,
  onDeleteRequest,
  actionsBusy,
  setOpen,
  t,
}: {
  runKey: string;
  isPinned: boolean;
  pinDisabled: boolean;
  onTogglePin: () => void;
  onArchiveRequest: (k: string) => void;
  onDeleteRequest: (k: string) => void;
  actionsBusy: boolean;
  setOpen: (v: boolean) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div
      className="absolute right-0 top-full z-40 mt-0.5 min-w-[9rem] rounded-md border border-border bg-popover py-0.5 shadow-md"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="flex w-full px-2.5 py-1.5 text-left text-[11px] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        disabled={pinDisabled}
        title={
          pinDisabled
            ? t("sidebar.maxPins", { max: MAX_PINNED_RUNS_PER_PROJECT })
            : undefined
        }
        onClick={(e) => {
          e.stopPropagation();
          setOpen(false);
          onTogglePin();
        }}
      >
        {isPinned ? t("sidebar.unpin") : t("sidebar.pinTop")}
      </button>
      <button
        type="button"
        className="flex w-full px-2.5 py-1.5 text-left text-[11px] hover:bg-accent"
        disabled={actionsBusy}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(false);
          onArchiveRequest(runKey);
        }}
      >
        {t("sidebar.archive")}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-destructive hover:bg-destructive/10"
        disabled={actionsBusy}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(false);
          onDeleteRequest(runKey);
        }}
      >
        {t("sidebar.delete")}
      </button>
    </div>
  );
}

export type SidebarProjectBlockProps = {
  project: ProjectSummaryDto;
  displayLabel: string;
  nested?: boolean;
  activeProject: boolean;
  projectExpanded: boolean;
  projectRuns: RunSummaryDto[];
  pinOrder: string[];
  runListLimit: number;
  runsQueryLoading: boolean;
  runsQueryError: boolean;
  selectedRunId: string | null;
  connectionReachable: boolean;
  archivePending: boolean;
  deletePending: boolean;
  queryClient: QueryClient;
  onToggleExpanded: () => void;
  onSelectProject: () => void;
  onBeginNewActivity: () => void;
  onRename: () => void;
  onDeleteProject: () => void;
  onSelectRun: (projectId: string, runKey: string) => void;
  onTogglePin: (runKey: string, validRunKeys: Set<string>) => void;
  onArchiveRequest: (runKey: string) => void;
  onDeleteRequest: (runKey: string) => void;
  onLoadMoreRuns: () => void;
};

export function SidebarProjectBlock(props: SidebarProjectBlockProps) {
  const {
    project: p,
    displayLabel,
    nested = false,
    activeProject,
    projectExpanded,
    projectRuns,
    pinOrder,
    runListLimit,
    runsQueryLoading,
    runsQueryError,
    selectedRunId,
    connectionReachable,
    archivePending,
    deletePending,
    queryClient,
    onToggleExpanded,
    onSelectProject,
    onBeginNewActivity,
    onRename,
    onDeleteProject,
    onSelectRun,
    onTogglePin,
    onArchiveRequest,
    onDeleteRequest,
    onLoadMoreRuns,
  } = props;

  const { t } = useI18n();

  const sortedRuns = sortRunsWithPins(projectRuns, pinOrder);
  const runsToShow = sortedRuns.slice(0, runListLimit);
  const hasMoreRuns = sortedRuns.length > runListLimit;
  const validRunKeys = new Set(projectRuns.map((r) => r.runId ?? r.id));
  const validPinnedKeys = pinOrder.filter((k) => validRunKeys.has(k));
  const projectTitle = [p.technicalSummary, p.subtitle?.trim()]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn("min-w-0", nested && "ml-2 border-l border-sidebar-border/30")}>
      <div
        className={cn(
          "flex min-h-[26px] items-center gap-0.5 py-px transition-colors duration-150",
          nested ? "pl-1 pr-1" : "px-1",
          activeProject ? "bg-sidebar-accent/25" : "hover:bg-sidebar-accent/15",
        )}
      >
        <button
          type="button"
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
          aria-expanded={projectExpanded}
          aria-controls={`sidebar-project-runs-${p.id}`}
          title={
            projectExpanded
              ? t("sidebar.collapseProjectRuns")
              : t("sidebar.expandProjectRuns")
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleExpanded();
          }}
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 transition-transform duration-150",
              projectExpanded && "rotate-90",
            )}
            aria-hidden
          />
        </button>
        <button
          type="button"
          title={projectTitle || undefined}
          className="flex min-h-7 min-w-0 flex-1 cursor-pointer items-center rounded-sm px-0.5 py-0.5 text-left transition-colors duration-150 hover:bg-sidebar-accent/20"
          onClick={onSelectProject}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate leading-tight text-sidebar-foreground",
              nested
                ? "text-[11px] font-medium normal-case tracking-normal"
                : "text-[12px] font-semibold uppercase tracking-wide",
            )}
          >
            {displayLabel}
          </span>
        </button>
        <ProjectOverflowMenu
          disabled={!connectionReachable}
          onRename={onRename}
          onDelete={onDeleteProject}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-6 shrink-0 cursor-pointer rounded-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/35 hover:text-sidebar-foreground"
          title={t("sidebar.newActivity")}
          aria-label={t("sidebar.newActivity")}
          disabled={!connectionReachable}
          onClick={(e) => {
            e.stopPropagation();
            onBeginNewActivity();
          }}
        >
          <Plus className="size-3" />
        </Button>
      </div>

      {projectExpanded ? (
        <div id={`sidebar-project-runs-${p.id}`} className="py-0.5">
          {runsQueryLoading ? (
            <ActivityRowsSkeleton rows={4} />
          ) : runsQueryError ? (
            <p className="cursor-default py-1 pl-3 text-[11px] leading-snug text-amber-600/90 dark:text-amber-300/90">
              {t("sidebar.activitiesLoadError")}
            </p>
          ) : projectRuns.length === 0 ? (
            <p className="cursor-default py-1 pl-3 text-[11px] leading-snug text-muted-foreground">
              {t("sidebar.noActivitiesYet")}
            </p>
          ) : (
            <>
              {runsToShow.map((run) => {
                const rk = run.runId ?? run.id;
                const isPinned = validPinnedKeys.includes(rk);
                const pinDisabled =
                  !isPinned &&
                  validPinnedKeys.length >= MAX_PINNED_RUNS_PER_PROJECT;
                const selectedRun = runMatchesSelectionKey(run, selectedRunId);

                return (
                  <SidebarActivityRow
                    key={runSelectionKey(run)}
                    run={run}
                    rk={rk}
                    isPinned={isPinned}
                    pinDisabled={pinDisabled}
                    selectedRun={selectedRun}
                    selectedRunId={selectedRunId}
                    projectId={p.id}
                    queryClient={queryClient}
                    onSelectRun={onSelectRun}
                    onTogglePin={onTogglePin}
                    validRunKeys={validRunKeys}
                    onArchiveRequest={onArchiveRequest}
                    onDeleteRequest={onDeleteRequest}
                    archivePending={archivePending}
                    deletePending={deletePending}
                  />
                );
              })}
              {hasMoreRuns ? (
                <div className="py-0.5 pl-3 pr-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-full cursor-pointer justify-start px-1 text-[11px] font-normal text-muted-foreground hover:bg-sidebar-accent/25 hover:text-sidebar-foreground"
                    onClick={onLoadMoreRuns}
                  >
                    {t("sidebar.moreActivities")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SidebarActivityRow({
  run,
  rk,
  isPinned,
  pinDisabled,
  selectedRun,
  selectedRunId,
  projectId,
  queryClient,
  onSelectRun,
  onTogglePin,
  validRunKeys,
  onArchiveRequest,
  onDeleteRequest,
  archivePending,
  deletePending,
}: {
  run: RunSummaryDto;
  rk: string;
  isPinned: boolean;
  pinDisabled: boolean;
  selectedRun: boolean;
  selectedRunId: string | null;
  projectId: string;
  queryClient: QueryClient;
  onSelectRun: (projectId: string, runKey: string) => void;
  onTogglePin: (runKey: string, validRunKeys: Set<string>) => void;
  validRunKeys: Set<string>;
  onArchiveRequest: (runKey: string) => void;
  onDeleteRequest: (runKey: string) => void;
  archivePending: boolean;
  deletePending: boolean;
}) {
  return (
    <div
      className={cn(
        "sb-activity-row group/activity-row flex w-full min-w-0 items-center gap-0",
        run.archived && "opacity-60",
        runStripeClass(run.state),
        run.state === "running" && "sb-activity-row--running",
        selectedRun && "sb-activity-row--selected",
        !selectedRun && "text-sidebar-foreground/88",
      )}
    >
      <button
        type="button"
        title={`${runTechnicalTooltip(run)} · ${runSummaryStatusLabel(run)}`}
        className="relative z-[2] flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 bg-transparent py-0 pl-3 pr-1 text-left hover:bg-transparent"
        onClick={() => {
          const key = runSelectionKey(run);
          onSelectRun(projectId, key);
          if (runMatchesSelectionKey(run, selectedRunId)) {
            void refetchRunReadModels(queryClient, key);
          }
        }}
      >
        {isPinned ? (
          <Pin
            className="sb-activity-row__marker size-2.5 shrink-0 text-muted-foreground/80"
            aria-hidden
          />
        ) : (
          <span
            className="sb-activity-row__marker w-2.5 shrink-0 text-center text-[11px] leading-none text-muted-foreground/40"
            aria-hidden
          >
            ·
          </span>
        )}
        <span className="sb-activity-row__label min-w-0 flex-1 truncate text-[13px] font-normal leading-snug">
          {formatRunDisplayTitle(run)}
        </span>
      </button>
      <RunOverflowMenu
        runKey={rk}
        isPinned={isPinned}
        pinDisabled={pinDisabled}
        onTogglePin={() => onTogglePin(rk, validRunKeys)}
        onArchiveRequest={onArchiveRequest}
        onDeleteRequest={onDeleteRequest}
        archiving={archivePending}
        deleting={deletePending}
      />
    </div>
  );
}

