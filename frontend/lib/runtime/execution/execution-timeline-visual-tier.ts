import type { ExecutionStepId } from "@/lib/runtime/execution/execution-step-catalog";
import type { SemanticWorkflowPhaseId } from "@/lib/runtime/execution/semantic-workflow-phase-id";

/**
 * Camada só de UI: hierarquia visual da timeline (hero / operacional / sistema).
 * Não altera builders nem contratos — apenas classes e densidade.
 */
export type ExecutionTimelineVisualTier = "hero" | "operational" | "system";

const HERO_STEPS = new Set<ExecutionStepId>([
  "clarification",
  "clarification_questions",
  "clarification_answers",
  "clarification_approval",
  "strategy_generated",
  "strategy_approval",
  "executor_running",
  "review_in_progress",
  "review_approved",
  "execution_completed",
  "final_result",
]);

const SYSTEM_STEPS = new Set<ExecutionStepId>([
  "operational_state",
  "activity_summary",
  "knowledge_update",
  "request_received",
]);

export function getExecutionTimelineVisualTier(
  stepId: ExecutionStepId,
): ExecutionTimelineVisualTier {
  if (HERO_STEPS.has(stepId)) return "hero";
  if (SYSTEM_STEPS.has(stepId)) return "system";
  return "operational";
}

/** Densidade visual por fase semântica (timeline macro). */
export function getSemanticTimelineVisualTier(
  phase: SemanticWorkflowPhaseId,
): ExecutionTimelineVisualTier {
  if (
    phase === "project_initialization" ||
    phase === "intake" ||
    phase === "run_bootstrap"
  ) {
    return "system";
  }
  if (phase === "execution_planning" || phase === "review")
    return "operational";
  if (phase === "refined_plan") return "hero";
  return "hero";
}
