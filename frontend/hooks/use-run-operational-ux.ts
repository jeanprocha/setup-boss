"use client";

import { useMemo } from "react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";
import type { ProjectGovernanceUx } from "@/lib/runtime/governance/ia-governance-ux";
import { deriveOperationalUxContract } from "@/lib/runtime/operational/derive-operational-ux-contract";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import { useRunEvents } from "@/hooks/use-run-events";
import { useProjectGovernance } from "@/hooks/use-project-governance";
import { composeAwaitingInitialSubmit } from "@/lib/runtime/intake/compose-governance-gate";
import { useIntakeStore } from "@/stores/intake-store";

export type UseRunOperationalUxInput = {
  projectId: string | null;
  runId: string | null;
  summary: RunSummaryDto | null;
  newActivityFlow?: boolean;
  clarificationBundle?: ClarificationBundleDto | null;
  clarificationApplies?: boolean;
  strategyBundle?: StrategyBundleDto | null;
  strategyApplies?: boolean;
  executionApplies?: boolean;
  executionLifecyclePhase?: string | null;
  /** Quando já disponível (evita fetch duplicado). */
  governanceUx?: ProjectGovernanceUx | null;
};

/**
 * Contrato UX operacional centralizado — sem alterar UI.
 * Consumidores futuros devem preferir `contract.uxPhase` a `summary.phase`.
 */
export function useRunOperationalUx(
  input: UseRunOperationalUxInput,
): RunOperationalUxContract {
  const {
    projectId,
    runId,
    summary,
    newActivityFlow = false,
    clarificationBundle = null,
    clarificationApplies = false,
    strategyBundle = null,
    strategyApplies = false,
    executionApplies = false,
    executionLifecyclePhase = null,
    governanceUx: governanceUxProp,
  } = input;

  const composeOnly = Boolean(newActivityFlow && !runId);
  const intakeUiPhase = useIntakeStore((s) => s.uiPhase);
  const preSubmitCompose = composeAwaitingInitialSubmit(composeOnly, intakeUiPhase);
  const governanceQ = useProjectGovernance(
    composeOnly &&
      !preSubmitCompose &&
      projectId &&
      governanceUxProp === undefined
      ? projectId
      : null,
  );
  const governanceUx = governanceUxProp ?? governanceQ.data ?? null;

  const { events } = useRunEvents(projectId, runId);

  return useMemo(
    () =>
      deriveOperationalUxContract({
        summary,
        newActivityFlow,
        governanceReadiness: governanceUx?.readiness ?? null,
        governanceOk: governanceUx?.ok ?? null,
        clarificationBundle,
        clarificationApplies,
        strategyBundle,
        strategyApplies,
        executionApplies,
        executionLifecyclePhase,
        events,
      }),
    [
      summary,
      newActivityFlow,
      governanceUx?.readiness,
      governanceUx?.ok,
      clarificationBundle,
      clarificationApplies,
      strategyBundle,
      strategyApplies,
      executionApplies,
      executionLifecyclePhase,
      events,
    ],
  );
}
