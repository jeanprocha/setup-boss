"use client";

import { useMissionShellReconciliation } from "@/hooks/use-mission-shell-reconciliation";
import { useWorkspaceRunSelectionReconciliation } from "@/hooks/use-workspace-run-selection-reconciliation";
import { useWorkspacePlanningPhaseSync } from "@/hooks/use-workspace-planning-phase-sync";

/** Efeito de reconciliação do shell — sem UI. */
export function MissionShellReconciliation() {
  useMissionShellReconciliation();
  useWorkspaceRunSelectionReconciliation();
  useWorkspacePlanningPhaseSync();
  return null;
}
