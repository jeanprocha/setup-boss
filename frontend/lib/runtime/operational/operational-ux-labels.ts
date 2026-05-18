import type { OperationalUxPhase, OperationalUxStep, PlanningStatus } from "./operational-ux-types.ts";

export const OPERATIONAL_UX_PHASE_LABELS_PT: Record<OperationalUxPhase, string> = {
  initialization: "Inicialização",
  planning: "Montando o plano",
  approval: "Aprovação",
  versioning: "Versionamento",
  execution: "Execução",
  review: "Review",
  finalization: "Finalização",
};

export const OPERATIONAL_UX_STEP_LABELS_PT: Record<OperationalUxStep, string> = {
  compose_activity: "Descrever atividade",
  ia_validation: "Validar base .IA",
  context_load: "Carregar contexto do projeto",
  initial_spec: "Gerar SPEC inicial",
  planning_questions: "Perguntas de entendimento",
  planning_answers: "Responder perguntas",
  planning_refine: "Refinar plano",
  planning_strategy: "Montar plano operacional",
  plan_approval_gate: "Rever e aprovar plano",
  versioning_branch: "Preparar branch",
  execution_active: "Execução em curso",
  review_active: "Revisão em curso",
  run_complete: "Atividade concluída",
  idle: "Aguardando",
};

export const PLANNING_STATUS_LABELS_PT: Record<PlanningStatus, string> = {
  idle: "A iniciar",
  questions_pending: "Perguntas pendentes",
  collecting_answers: "A recolher respostas",
  generating_plan: "A gerar plano",
  plan_ready_for_review: "Plano disponível para revisão",
  adjusting_plan: "A ajustar plano",
  strategy_building: "A montar plano operacional",
  complete: "Plano montado",
};

export function labelOperationalUxPhase(phase: OperationalUxPhase): string {
  return OPERATIONAL_UX_PHASE_LABELS_PT[phase];
}

export function labelOperationalUxStep(step: OperationalUxStep): string {
  return OPERATIONAL_UX_STEP_LABELS_PT[step];
}

export function labelPlanningStatus(status: PlanningStatus): string {
  return PLANNING_STATUS_LABELS_PT[status];
}
