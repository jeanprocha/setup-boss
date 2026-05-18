import type { IntakeUiPhase } from "@/lib/runtime/intake/intake-types";

import { labelStrategyRuntimePhase } from "@/lib/runtime/mission/runtime-workflow-phases";

export type IntakeBadgeTone = "neutral" | "info" | "warn" | "success" | "error";

export function intakePhaseLabel(phase: IntakeUiPhase): string {
  const map: Record<IntakeUiPhase, string> = {
    idle: "Pronto",
    creating_run: "A criar corrida…",
    intake_running: "Intake em curso",
    clarification_required: "Clarificação necessária",
    clarification_ready: "Clarificação pronta",
    strategy_pending: labelStrategyRuntimePhase("strategy_pending"),
    failed: "Falhou",
  };
  return map[phase] ?? phase;
}

export function intakePhaseTone(phase: IntakeUiPhase): IntakeBadgeTone {
  if (phase === "failed") return "error";
  if (phase === "clarification_required") return "warn";
  if (phase === "clarification_ready" || phase === "strategy_pending") return "success";
  if (phase === "creating_run" || phase === "intake_running") return "info";
  return "neutral";
}

export function shouldOpenClarificationTab(
  clarificationRequired: boolean,
  initialState: IntakeUiPhase,
): boolean {
  return (
    clarificationRequired ||
    initialState === "clarification_required" ||
    initialState === "clarification_ready"
  );
}
