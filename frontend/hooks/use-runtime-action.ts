"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import {
  getActionAvailability,
  actionLabel,
} from "@/lib/runtime/actions/action-availability";
import { invalidateAfterRuntimeAction } from "@/lib/runtime/actions/invalidate-runtime-queries";
import { mapActionError } from "@/lib/runtime/actions/runtime-action-errors";
import { executeRuntimeAction } from "@/lib/runtime/actions/runtime-actions";
import type {
  RuntimeActionContext,
  RuntimeActionId,
  RuntimeActionResult,
} from "@/lib/runtime/actions/runtime-action-types";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import {
  auditEntryToRuntimeEvent,
  useRuntimeActionAuditStore,
} from "@/stores/runtime-action-audit-store";

export function buildActionContext(
  summary: RunSummaryDto | null,
  projectId: string | null,
): RuntimeActionContext {
  const connection = useRuntimeConnectionStore.getState().connection;
  return {
    projectId,
    jobId: summary?.id ?? null,
    runId: summary?.runId ?? null,
    jobStatus: summary?.jobStatus ?? null,
    retryable: summary?.retryable === true,
    runtimeReachable: connection.reachable,
    connectionDegraded: connection.degraded,
  };
}

export function useRuntimeAction(
  actionId: RuntimeActionId,
  summary: RunSummaryDto | null,
  projectId: string | null,
) {
  const qc = useQueryClient();
  const pushAudit = useRuntimeActionAuditStore((s) => s.pushEntry);
  const [lastResult, setLastResult] = useState<RuntimeActionResult | null>(null);

  const ctx = useMemo(
    () => buildActionContext(summary, projectId),
    [summary, projectId],
  );

  const availability = useMemo(
    () => getActionAvailability(actionId, ctx),
    [actionId, ctx],
  );

  const mutation = useMutation({
    mutationFn: async (opts?: { cancelReason?: string }) => {
      if (availability.unsupported && availability.available) {
        return executeRuntimeAction(actionId, ctx, opts);
      }
      if (!availability.available) {
        throw mapActionError(
          new Error(availability.disabledReason || "Acção indisponível"),
        );
      }
      return executeRuntimeAction(actionId, ctx, opts);
    },
    onSuccess: (result) => {
      setLastResult(result);
      const runKey = summary?.runId ?? summary?.id ?? null;
      invalidateAfterRuntimeAction(qc, actionId, {
        projectId,
        runKey,
      });
      pushAudit({
        actionId,
        outcome: result.outcome,
        message: result.message,
        jobId: ctx.jobId,
        runId: ctx.runId,
      });
    },
    onError: (e) => {
      const err = mapActionError(e);
      const result: RuntimeActionResult = {
        ok: false,
        actionId,
        outcome: err.outcome,
        message: err.message,
      };
      setLastResult(result);
      pushAudit({
        actionId,
        outcome: err.outcome,
        message: err.message,
        jobId: ctx.jobId,
        runId: ctx.runId,
      });
    },
  });

  const run = useCallback(
    (opts?: { cancelReason?: string }) => {
      mutation.mutate(opts);
    },
    [mutation],
  );

  return {
    actionId,
    label: actionLabel(actionId),
    availability,
    run,
    isPending: mutation.isPending,
    lastResult,
    auditEvent:
      lastResult != null
        ? auditEntryToRuntimeEvent({
            id: "pending",
            actionId,
            outcome: lastResult.outcome,
            message: lastResult.message,
            tsIso: new Date().toISOString(),
            jobId: ctx.jobId,
            runId: ctx.runId,
          })
        : null,
  };
}

export function useRetryRun(
  summary: RunSummaryDto | null,
  projectId: string | null,
) {
  return useRuntimeAction("retry-run", summary, projectId);
}

export function useResumeRun(
  summary: RunSummaryDto | null,
  projectId: string | null,
) {
  return useRuntimeAction("resume-run", summary, projectId);
}

export function useCancelRun(
  summary: RunSummaryDto | null,
  projectId: string | null,
) {
  return useRuntimeAction("cancel-run", summary, projectId);
}

export function useValidateIntegrity(
  summary: RunSummaryDto | null,
  projectId: string | null,
) {
  return useRuntimeAction("validate-integrity", summary, projectId);
}

export function useRebuildObservability(
  summary: RunSummaryDto | null,
  projectId: string | null,
) {
  return useRuntimeAction("rebuild-observability", summary, projectId);
}

export function useRefreshRuntime(
  summary: RunSummaryDto | null,
  projectId: string | null,
) {
  return useRuntimeAction("refresh", summary, projectId);
}
