"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ExecutionLifecyclePhase } from "@/lib/runtime/execution/execution-types";
import type {
  ExecuteAvailability,
  OrchestrationState,
} from "@/lib/runtime/orchestration/orchestration-types";
import { formatExecutionAutoStartBlockMessage } from "@/lib/runtime/execution/execution-auto-start-block-message";
import { shouldAutoStartExecutionAfterVersioning } from "@/lib/runtime/execution/execution-auto-start-policy";
import {
  logExecutionAutoStartEvaluated,
  logExecutionAutoStartFailed,
  logExecutionAutoStartStarted,
  resetExecutionAutoStartLogSession,
} from "@/lib/runtime/execution/log-execution-auto-start-observation";

type ExecuteMutation = {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  mutate: () => void;
  reset: () => void;
};

/**
 * Dispara POST /runs/:id/execute uma vez após versionamento concluído.
 */
export function useExecutionAutoStart(opts: {
  runKey: string | null;
  projectId?: string | null;
  summary: RunSummaryDto;
  lifecyclePhase: ExecutionLifecyclePhase | null;
  orchestrationState: OrchestrationState | null;
  availability: ExecuteAvailability;
  executeRun: ExecuteMutation;
}): { autoStartEligible: boolean; autoStartFailed: boolean; retryAutoStart: () => void } {
  const {
    runKey,
    projectId,
    summary,
    lifecyclePhase,
    orchestrationState,
    availability,
    executeRun,
  } = opts;

  const attemptedRef = useRef<string | null>(null);
  const [autoStartFailed, setAutoStartFailed] = useState(false);

  const autoStartEligible = shouldAutoStartExecutionAfterVersioning(
    summary,
    lifecyclePhase,
    orchestrationState,
    summary.jobStatus,
  );

  useEffect(() => {
    setAutoStartFailed(false);
    attemptedRef.current = null;
    resetExecutionAutoStartLogSession(runKey);
  }, [runKey]);

  useEffect(() => {
    if (executeRun.isError) {
      setAutoStartFailed(true);
      if (runKey && executeRun.error instanceof Error) {
        logExecutionAutoStartFailed({
          runId: runKey,
          projectId,
          errorMessage: executeRun.error.message,
        });
      }
    }
  }, [executeRun.isError, executeRun.error, runKey, projectId]);

  useEffect(() => {
    if (!runKey || !autoStartEligible) return;

    const blockCopy = formatExecutionAutoStartBlockMessage({
      availability,
      git: summary.git,
    });

    logExecutionAutoStartEvaluated({
      runId: runKey,
      projectId,
      canExecute: availability.canExecute,
      blockReason: availability.reason,
      blockMessage: blockCopy?.body ?? availability.message,
      expectedBranch: summary.git?.activityBranch ?? null,
      currentBranch: summary.git?.currentBranch ?? null,
    });

    if (!availability.canExecute) return;
    if (executeRun.isPending || executeRun.isSuccess) return;
    if (autoStartFailed) return;
    if (attemptedRef.current === runKey) return;

    attemptedRef.current = runKey;
    logExecutionAutoStartStarted({ runId: runKey, projectId });
    executeRun.mutate();
  }, [
    runKey,
    projectId,
    autoStartEligible,
    availability,
    summary.git,
    executeRun.isPending,
    executeRun.isSuccess,
    executeRun.mutate,
    autoStartFailed,
  ]);

  const retryAutoStart = useCallback(() => {
    setAutoStartFailed(false);
    attemptedRef.current = null;
    executeRun.reset();
    if (availability.canExecute) executeRun.mutate();
  }, [availability.canExecute, executeRun]);

  return { autoStartEligible, autoStartFailed, retryAutoStart };
}
