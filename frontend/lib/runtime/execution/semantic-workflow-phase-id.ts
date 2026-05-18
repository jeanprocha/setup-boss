/** Fases macro da timeline (camada de apresentação). Sem dependências de card types. */
export type SemanticWorkflowPhaseId =
  | "project_initialization"
  | "intake"
  | "run_bootstrap"
  | "clarification_spec"
  | "refined_plan"
  | "strategy"
  | "execution_planning"
  | "execution"
  | "review"
  | "finalization";

export function semanticTimelineAnchorId(
  phase: SemanticWorkflowPhaseId,
): string {
  return `exec-semantic-${phase}`;
}
