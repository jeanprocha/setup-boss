"use client";

import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import { shouldShowPlanningOperationalPlanPanel } from "@/lib/runtime/operational/planning-operational-plan-state";
import { shouldShowPlanningUnderstandingPanel } from "@/lib/runtime/operational/planning-understanding-operational-state";
import { PlanningUnderstandingPanel } from "@/components/features/planning/PlanningUnderstandingPanel";
import { PlanningOperationalPlanPanel } from "@/components/features/planning/PlanningOperationalPlanPanel";
import { useClarification } from "@/hooks/use-clarification";
import type { OperationalPhaseStackMode } from "@/lib/runtime/operational/operational-phase-stack";

export function PlanningPhasePanel({
  projectId,
  summary,
  operationalUx,
  executionApplies,
  isInitializationPhase,
  stackMode = "active",
}: {
  projectId: string | null;
  summary: RunSummaryDto;
  operationalUx: RunOperationalUxContract;
  executionApplies: boolean;
  isInitializationPhase: boolean;
  stackMode?: OperationalPhaseStackMode;
}) {
  const runKey = summary.runId ?? summary.id;
  const clarification = useClarification(runKey, summary.phase, summary.state);
  const panelInput = {
    executionApplies,
    isInitializationPhase,
    clarificationApplies: clarification.applies,
    bundle: clarification.bundle,
  };

  if (stackMode === "history") {
    return (
      <PlanningUnderstandingPanel
        projectId={projectId}
        summary={summary}
        operationalUx={operationalUx}
        historyMode
      />
    );
  }

  if (shouldShowPlanningOperationalPlanPanel(panelInput)) {
    return (
      <PlanningOperationalPlanPanel
        projectId={projectId}
        summary={summary}
        operationalUx={operationalUx}
      />
    );
  }

  if (shouldShowPlanningUnderstandingPanel(panelInput)) {
    return (
      <PlanningUnderstandingPanel
        projectId={projectId}
        summary={summary}
        operationalUx={operationalUx}
      />
    );
  }

  return null;
}
