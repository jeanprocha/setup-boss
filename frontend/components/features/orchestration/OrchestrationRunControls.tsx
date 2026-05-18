"use client";

import { PrepareGitBranchCard } from "@/components/features/git-branch/PrepareGitBranchCard";
import { ExecuteRunButton } from "@/components/features/orchestration/ExecuteRunButton";
import { ExecutionBootstrapCard } from "@/components/features/orchestration/ExecutionBootstrapCard";
import { OrchestrationStateCard } from "@/components/features/orchestration/OrchestrationStateCard";
import { RuntimeExecutionBanner } from "@/components/features/orchestration/RuntimeExecutionBanner";
import { useOrchestration } from "@/hooks/use-orchestration";
import { useOrchestrationMutations } from "@/hooks/use-orchestration-mutations";
import { useRuntimeRecovery } from "@/hooks/use-runtime-recovery";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import { isOrchestrationActive } from "@/lib/runtime/orchestration/orchestration-state";

export function OrchestrationRunControls({
  summary,
  projectId,
  compact,
}: {
  summary: RunSummaryDto;
  projectId: string | null;
  compact?: boolean;
}) {
  const runKey = summary.runId ?? summary.id;
  const orch = useOrchestration(summary, runKey);
  const recovery = useRuntimeRecovery(projectId, runKey);
  const recoveryStatus =
    orch.bootstrap?.recoveryStatus ?? recovery.activeRun?.recoveryStatus ?? null;
  const recoveryHint =
    recovery.activeRun?.recoveryReasons?.[0] ??
    orch.bootstrap?.recoveryReasons?.[0] ??
    null;
  const mutations = useOrchestrationMutations({
    runKey,
    projectId,
    availability: orch.availability,
  });

  const showBanner =
    isOrchestrationActive(orch.orchestrationState) ||
    recoveryStatus === "stale" ||
    recoveryStatus === "orphaned" ||
    recoveryStatus === "recovery_pending";

  return (
    <div className="flex flex-col gap-2">
      {showBanner ? (
        <RuntimeExecutionBanner
          executionState={orch.executionState}
          orchestrationState={orch.orchestrationState}
          recoveryStatus={recoveryStatus}
          recoveryHint={recoveryHint}
          message={
            mutations.executeRun.isError
              ? mutations.executeRun.error instanceof Error
                ? mutations.executeRun.error.message
                : "Falha ao disparar execução"
              : null
          }
        />
      ) : null}

      {!compact ? (
        <OrchestrationStateCard
          executionState={orch.executionState}
          orchestrationState={orch.orchestrationState}
          degraded={orch.availability.degraded}
        />
      ) : null}

      {orch.bootstrap ? (
        <ExecutionBootstrapCard bootstrap={orch.bootstrap} />
      ) : null}

      <PrepareGitBranchCard
        summary={summary}
        projectId={projectId}
        availability={orch.availability}
      />

      <ExecuteRunButton
        availability={orch.availability}
        isPending={mutations.executeRun.isPending}
        onExecute={() => mutations.executeRun.mutate()}
      />
    </div>
  );
}
