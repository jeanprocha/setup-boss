import type { QueryClient } from "@tanstack/react-query";
import type { ApiJobSummary } from "@/lib/api/runtime-types";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import type { RunsQueryResult } from "@/hooks/use-runs";
import { mapApiJobToRunSummary } from "@/lib/runtime/adapters/map-job";
import { dedupeRunSummariesByRunId } from "@/lib/runtime/shell/dedupe-run-summaries";
import {
  runMatchesSelectionKey,
  runSelectionKey,
} from "@/lib/runtime/run-selection";
import type { CreateRunResultDto } from "@/lib/runtime/intake/intake-types";

function optimisticJobFromCreate(
  result: CreateRunResultDto,
  projectId: string,
  task: string,
): ApiJobSummary {
  const title = task.trim().slice(0, 200) || result.runId;
  return {
    id: result.jobId,
    status: "completed",
    projectId,
    taskArg: task,
    createdAt: result.createdAt,
    runId: result.runId,
    activityTitle: title,
    metadata: {
      uiPhase: result.uiPhase ?? "intake",
      uiState: result.uiState ?? "running",
      initialState: result.initialState,
      intakeTaskText: task.trim(),
    },
  };
}

/** Garante a nova corrida na lista da sidebar antes da reconciliação / refetch. */
export function seedProjectRunAfterCreate(
  qc: QueryClient,
  projectId: string,
  result: CreateRunResultDto,
  task: string,
): string {
  const summary = mapApiJobToRunSummary(
    optimisticJobFromCreate(result, projectId, task),
  );
  const runKey = runSelectionKey(summary);

  const patch = (old: RunsQueryResult | undefined): RunsQueryResult => {
    if (!old || old.source !== "runtime") {
      return { summaries: [summary], source: "runtime" };
    }
    if (old.summaries.some((s) => runMatchesSelectionKey(s, runKey))) {
      return old;
    }
    return {
      ...old,
      summaries: dedupeRunSummariesByRunId([summary, ...old.summaries]),
    };
  };

  qc.setQueryData(runtimeQueryKeys.projectRuns(projectId, false), patch);
  qc.setQueryData(runtimeQueryKeys.projectRuns(projectId, true), patch);

  return runKey;
}
