"use client";

import { memo, useMemo } from "react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import { ActiveStepBanner } from "@/components/features/run-detail/ActiveStepBanner";
import { ExecutionTimelineView } from "@/components/features/run-detail/ExecutionTimelineView";
import { useRunEvents } from "@/hooks/use-run-events";
import { useRunUxState } from "@/hooks/use-run-ux-state";
import {
  deriveExecutionTimeline,
  filterExecutionTimelineToActualFlow,
} from "@/lib/runtime/ux/derive-execution-timeline";
import { normalizeRuntimeUxEvents } from "@/lib/runtime/ux/normalize-runtime-event";
import type { VersioningCheckpointContext } from "@/lib/runtime/ux/operational-visual-model";

export type OperationalUxPanelProps = {
  projectId: string | null;
  runId: string | null;
  summary: RunSummaryDto | null;
  attentionHint?: string | null;
  onPrepareBranch?: () => void;
  prepareBranchPending?: boolean;
};

function buildVersioningContext(
  summary: RunSummaryDto | null,
  prepareBranchPending: boolean,
): VersioningCheckpointContext {
  const git = summary?.git;
  return {
    branch: git?.activityBranch ?? summary?.branchHint ?? null,
    gitStatus: git?.status ?? null,
    preparePending: prepareBranchPending,
    executeBlockCode: summary?.git?.executeBlockCode ?? null,
  };
}

function OperationalUxPanelInner({
  projectId,
  runId,
  summary,
  attentionHint,
  onPrepareBranch,
  prepareBranchPending = false,
}: OperationalUxPanelProps) {
  const ux = useRunUxState(projectId, runId);
  const { events } = useRunEvents(projectId, runId);

  const versioning = useMemo(
    () => buildVersioningContext(summary, prepareBranchPending),
    [summary, prepareBranchPending],
  );

  const visibleCheckpoints = useMemo(() => {
    const uxEvents = normalizeRuntimeUxEvents(events);
    const timeline = deriveExecutionTimeline(uxEvents, ux, { versioning });
    return filterExecutionTimelineToActualFlow(timeline);
  }, [events, ux, versioning]);

  if (!runId || !summary) return null;

  return (
    <section
      className="mb-4 rounded-xl border border-border/70 bg-card/80 px-3.5 py-3 shadow-sm"
      aria-label="Fluxo operacional"
    >
      <ActiveStepBanner
        ux={ux}
        attentionHint={attentionHint}
        versioning={versioning}
        onPrepareBranch={onPrepareBranch}
        prepareBranchPending={prepareBranchPending}
      />
      <ExecutionTimelineView
        checkpoints={visibleCheckpoints}
        showSectionTitle
        onPrepareBranch={onPrepareBranch}
        prepareBranchPending={prepareBranchPending}
      />
    </section>
  );
}

export const OperationalUxPanel = memo(OperationalUxPanelInner);
