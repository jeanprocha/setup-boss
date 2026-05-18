"use client";

import { OrchestrationStateBadge } from "@/components/features/orchestration/OrchestrationStateBadge";
import { RecoveryStatusBadge } from "@/components/features/orchestration/RecoveryStatusBadge";
import type {
  OrchestrationExecutionState,
  OrchestrationState,
  RuntimeRecoveryStatus,
} from "@/lib/runtime/orchestration/orchestration-types";
import { isOrchestrationActive } from "@/lib/runtime/orchestration/orchestration-state";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

export function RuntimeExecutionBanner({
  executionState,
  orchestrationState,
  recoveryStatus,
  recoveryHint,
  message,
  className,
}: {
  executionState: OrchestrationExecutionState;
  orchestrationState: OrchestrationState;
  recoveryStatus?: RuntimeRecoveryStatus;
  recoveryHint?: string | null;
  message?: string | null;
  className?: string;
}) {
  const recoveryVisible =
    recoveryStatus === "stale" ||
    recoveryStatus === "orphaned" ||
    recoveryStatus === "recovery_pending";
  if (
    !isOrchestrationActive(orchestrationState) &&
    executionState === "ready_for_execution" &&
    !recoveryVisible
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-sb-running/30 bg-sb-running/8 px-2.5 py-1.5",
        className,
      )}
      role="status"
    >
      <Activity className="size-3.5 shrink-0 text-sb-running" aria-hidden />
      <span className="text-[11px] font-medium text-foreground/90">
        {message ?? "Orchestration de execução"}
      </span>
      <OrchestrationStateBadge
        executionState={executionState}
        orchestrationState={orchestrationState}
      />
      <RecoveryStatusBadge status={recoveryStatus ?? null} hint={recoveryHint} />
    </div>
  );
}
