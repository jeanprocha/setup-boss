import type { OperationalUxPhase } from "./operational-ux-types.ts";

export const OPERATIONAL_STEP_ONE_TITLE = "Iniciando a atividade";

export const OPERATIONAL_STEP_ONE_SUBTITLE = {
  describeActivity: "Descreva a atividade",
  definingPlan: "Definindo o plano",
  planApproval: "Aprovação do plano",
  prepareBranch: "Preparar branch da atividade",
} as const;

/** Step 1 — do intake até branch preparada (antes da execução). */
export function isOperationalStepOnePhase(phase: OperationalUxPhase): boolean {
  return (
    phase === "initialization" ||
    phase === "planning" ||
    phase === "approval" ||
    phase === "versioning"
  );
}

export function operationalStepOneSubtitleForPhase(
  phase: OperationalUxPhase,
  opts?: { preSubmitCompose?: boolean },
): string {
  if (phase === "initialization" && opts?.preSubmitCompose) {
    return OPERATIONAL_STEP_ONE_SUBTITLE.describeActivity;
  }
  if (phase === "planning") return OPERATIONAL_STEP_ONE_SUBTITLE.definingPlan;
  if (phase === "approval") return OPERATIONAL_STEP_ONE_SUBTITLE.planApproval;
  if (phase === "versioning") return OPERATIONAL_STEP_ONE_SUBTITLE.prepareBranch;
  return OPERATIONAL_STEP_ONE_SUBTITLE.describeActivity;
}
