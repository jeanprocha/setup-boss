"use client";

import { useEffect, useMemo } from "react";
import { useClarification } from "@/hooks/use-clarification";
import { useExecution } from "@/hooks/use-execution";
import { useStrategy } from "@/hooks/use-strategy";
import { useRunEvents } from "@/hooks/use-run-events";
import { useProjectGovernance } from "@/hooks/use-project-governance";
import {
  deriveExecuteAvailability,
  deriveExecutionState,
  deriveOrchestrationState,
} from "@/lib/runtime/orchestration/orchestration-state";
import {
  describeOperationalExecuteReadiness,
  isOperationalExecuteReadyDespiteStaleJobPhase,
  isStaleEarlyJobPhase,
} from "@/lib/runtime/orchestration/operational-execute-readiness";
import {
  logStaleUiPhaseExecuteBypass,
  resetStaleUiPhaseExecuteLogSession,
} from "@/lib/runtime/orchestration/log-stale-ui-phase-execute-observation";
import { deriveOperationalUxContract } from "@/lib/runtime/operational/derive-operational-ux-contract";
import { projectGovernanceEnabledForIntake } from "@/lib/runtime/intake/compose-governance-gate";
import { useIntakeStore } from "@/stores/intake-store";
import { useOperationalReview } from "@/hooks/use-operational-review";
import { useOperationalFinalization } from "@/hooks/use-operational-finalization";
import { useOrchestrationStore } from "@/stores/orchestration-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import type { RunSummaryDto } from "@/lib/api/runtime-types";

export type UseOrchestrationContext = {
  projectId?: string | null;
  newActivityFlow?: boolean;
};

export function useOrchestration(
  summary: RunSummaryDto | null,
  runKey: string | null,
  context?: UseOrchestrationContext,
) {
  const lastBootstrap = useOrchestrationStore((s) => s.lastBootstrap);
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const degraded = useRuntimeConnectionStore((s) => s.connection.degraded);

  const phase = summary?.phase ?? null;
  const state = summary?.state ?? null;
  const jobStatus = summary?.jobStatus ?? null;
  const fetchKey = summary ? runKey : null;

  const clarification = useClarification(fetchKey, phase, state);
  const strategy = useStrategy(fetchKey, phase, state);
  const execution = useExecution(fetchKey, phase, state);
  const operationalReview = useOperationalReview(
    fetchKey,
    summary,
    execution.bundle?.summary.lifecycle.phase ?? null,
  );
  const operationalFinalization = useOperationalFinalization(
    fetchKey,
    operationalReview.hitl,
  );

  const bootstrap =
    lastBootstrap && lastBootstrap.runId === fetchKey ? lastBootstrap : null;

  const orchestrationState = deriveOrchestrationState(
    bootstrap,
    execution.bundle,
    { runtimeReachable: reachable, jobStatus },
  );

  const executionState = deriveExecutionState(bootstrap, execution.bundle);

  const availability = deriveExecuteAvailability({
    runKey: fetchKey,
    reachable,
    clarification: clarification.bundle,
    strategy: strategy.bundle,
    bootstrap,
    jobStatus,
    phaseRaw: phase,
    git: summary?.git ?? null,
  });

  const projectId = context?.projectId ?? summary?.projectId ?? null;

  useEffect(() => {
    resetStaleUiPhaseExecuteLogSession(runKey);
  }, [runKey]);

  useEffect(() => {
    if (!runKey || !phase || !isStaleEarlyJobPhase(phase)) return;
    if (
      !isOperationalExecuteReadyDespiteStaleJobPhase({
        clarification: clarification.bundle,
        git: summary?.git ?? null,
      })
    ) {
      return;
    }
    logStaleUiPhaseExecuteBypass({
      runId: runKey,
      projectId,
      phaseRaw: phase,
      canExecute: availability.canExecute,
      blockReason: availability.reason,
      operational: describeOperationalExecuteReadiness({
        clarification: clarification.bundle,
        git: summary?.git ?? null,
      }),
    });
  }, [
    runKey,
    projectId,
    phase,
    clarification.bundle,
    summary?.git,
    availability.canExecute,
    availability.reason,
  ]);
  const newActivityFlow = context?.newActivityFlow ?? false;
  const composeOnly = Boolean(newActivityFlow && !runKey);
  const intakeUiPhase = useIntakeStore((s) => s.uiPhase);
  const phaseRaw = String(summary?.phase ?? "").toLowerCase();
  const runInIntake =
    Boolean(runKey) &&
    (phaseRaw === "intake" || phaseRaw === "queue" || phaseRaw === "pending");
  const needsProjectGovernance = projectGovernanceEnabledForIntake({
    projectId,
    composeOnly,
    runInIntake,
    intakeUiPhase,
  });
  const governanceQ = useProjectGovernance(
    needsProjectGovernance ? projectId : null,
  );
  const { events } = useRunEvents(projectId, fetchKey);

  const operationalUx = useMemo(
    () =>
      deriveOperationalUxContract({
        summary,
        newActivityFlow,
        governanceReadiness: governanceQ.data?.readiness ?? null,
        governanceOk: governanceQ.data?.ok ?? null,
        clarificationBundle: clarification.bundle,
        clarificationApplies: clarification.applies,
        strategyBundle: strategy.bundle,
        strategyApplies: strategy.applies,
        executionApplies: execution.applies,
        executionLifecyclePhase:
          execution.bundle?.summary.lifecycle.phase ?? null,
        events,
        operationalReviewStatus: operationalReview.hitl?.status ?? null,
        operationalFinalizationStatus:
          operationalFinalization.hitl?.status ?? null,
      }),
    [
      summary,
      newActivityFlow,
      governanceQ.data?.readiness,
      governanceQ.data?.ok,
      clarification.bundle,
      clarification.applies,
      strategy.bundle,
      strategy.applies,
      execution.applies,
      execution.bundle?.summary.lifecycle.phase,
      events,
      operationalReview.hitl?.status,
      operationalFinalization.hitl?.status,
    ],
  );

  return {
    bootstrap,
    orchestrationState,
    executionState,
    availability: {
      ...availability,
      degraded: availability.degraded || degraded,
    },
    clarification,
    strategy,
    execution,
    /** Contrato UX operacional (fase 1) — preferir a `summary.phase` em novos consumidores. */
    operationalUx,
  };
}
