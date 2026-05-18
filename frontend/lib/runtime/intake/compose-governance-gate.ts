import type { IntakeUiPhase } from "./intake-types";

/** Nova atividade sem corrida: aguarda o primeiro submit antes de validar `.IA`. */
export function composeAwaitingInitialSubmit(
  composeOnly: boolean,
  intakeUiPhase: IntakeUiPhase,
): boolean {
  return composeOnly && intakeUiPhase === "idle";
}

export function projectGovernanceEnabledForIntake(opts: {
  projectId: string | null | undefined;
  composeOnly: boolean;
  runInIntake: boolean;
  intakeUiPhase: IntakeUiPhase;
}): boolean {
  if (!opts.projectId) return false;
  if (
    composeAwaitingInitialSubmit(opts.composeOnly, opts.intakeUiPhase)
  ) {
    return false;
  }
  return opts.composeOnly || opts.runInIntake;
}
