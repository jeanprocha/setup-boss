"use client";

import { useMemo } from "react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import { useRuns } from "@/hooks/use-runs";

export function useRunSummary(
  projectId: string | null,
  runId: string | null,
): RunSummaryDto | null {
  const rq = useRuns(projectId);
  return useMemo(() => {
    if (!runId || !rq.data?.summaries?.length) return null;
    return (
      rq.data.summaries.find(
        (s) => s.runId === runId || s.id === runId,
      ) ?? null
    );
  }, [rq.data?.summaries, runId]);
}
