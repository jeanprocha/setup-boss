import type { SemanticWorkflowPhaseId } from "@/lib/runtime/execution/semantic-workflow-phase-id";

export function timelinePhaseLabelKey(phase: SemanticWorkflowPhaseId): string {
  return `timeline.phases.${phase}`;
}

export function translateTimelinePhaseTitle(
  t: (key: string, vars?: Record<string, string | number>) => string,
  phase: SemanticWorkflowPhaseId | undefined,
  fallback: string,
): string {
  if (!phase) return fallback;
  const key = timelinePhaseLabelKey(phase);
  const translated = t(key);
  return translated === key ? fallback : translated;
}
