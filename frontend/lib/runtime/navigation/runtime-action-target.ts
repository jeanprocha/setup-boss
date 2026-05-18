import type { RightPanelTab } from "@/stores/mission-layout-store";
import { semanticTimelineAnchorId } from "@/lib/runtime/execution/semantic-workflow-phase-id";
import type { SemanticWorkflowPhaseId } from "@/lib/runtime/execution/semantic-workflow-phase-id";

export const RUNTIME_ACTION_TARGETS = [
  "clarification_spec",
  "refined_plan",
  "strategy",
  "execution",
  "review",
  "observability",
] as const;

export type RuntimeActionTarget = (typeof RUNTIME_ACTION_TARGETS)[number];

export const RUNTIME_ACTION_KINDS = [
  "scroll_focus",
  "open_observability",
  "open_artifacts",
] as const;

export type RuntimeActionKind = (typeof RUNTIME_ACTION_KINDS)[number];

export const RUNTIME_PANEL_IDS: Record<RuntimeActionTarget, string> = {
  clarification_spec: "runtime-panel-clarification-spec",
  refined_plan: "runtime-panel-refined-plan",
  strategy: "runtime-panel-strategy",
  execution: "runtime-panel-execution",
  review: "runtime-panel-review",
  observability: "runtime-panel-observability",
};

export const RUNTIME_FOCUS_SELECTORS = {
  clarificationAnswer: '[data-runtime-focus="clarification-answer"]',
  refinedPlanApproval: '[data-runtime-focus="refined-plan-approval"]',
  strategyPrimary: '[data-runtime-focus="strategy-primary"]',
  executionPrimary: '[data-runtime-focus="execution-primary"]',
} as const;

export type ResolvedRuntimeActionAnchor = {
  scrollAnchorId: string | null;
  panelId: string;
  focusSelector: string | null;
  rightPanelTab: RightPanelTab | null;
  expandTimeline: boolean;
};

const SEMANTIC_PHASE_TARGET: Record<
  SemanticWorkflowPhaseId,
  RuntimeActionTarget | null
> = {
  project_initialization: null,
  intake: null,
  run_bootstrap: null,
  clarification_spec: "clarification_spec",
  refined_plan: "refined_plan",
  strategy: "strategy",
  execution_planning: "execution",
  execution: "execution",
  review: "review",
  finalization: "execution",
};

export function runtimeActionTargetForSemanticPhase(
  phase: SemanticWorkflowPhaseId,
): RuntimeActionTarget | null {
  return SEMANTIC_PHASE_TARGET[phase] ?? null;
}

export function runtimeActionTargetForPhaseLabel(
  label: string | undefined,
): RuntimeActionTarget | null {
  if (!label) return null;
  const x = label.toLowerCase();
  if (x.includes("clarific")) return "clarification_spec";
  if (x.includes("plano refinado") || x.includes("refinado")) return "refined_plan";
  if (x.includes("estratégia") || x.includes("estrategia")) return "strategy";
  if (x.includes("execu")) return "execution";
  if (x.includes("review")) return "review";
  return null;
}

/** Âncoras estáveis para scroll, painel embutido e foco. */
export function resolveRuntimeActionTargetAnchor(
  target: RuntimeActionTarget,
): ResolvedRuntimeActionAnchor {
  switch (target) {
    case "clarification_spec":
      return {
        scrollAnchorId: semanticTimelineAnchorId("clarification_spec"),
        panelId: RUNTIME_PANEL_IDS.clarification_spec,
        focusSelector: RUNTIME_FOCUS_SELECTORS.clarificationAnswer,
        rightPanelTab: null,
        expandTimeline: true,
      };
    case "refined_plan":
      return {
        scrollAnchorId: semanticTimelineAnchorId("refined_plan"),
        panelId: RUNTIME_PANEL_IDS.refined_plan,
        focusSelector: RUNTIME_FOCUS_SELECTORS.refinedPlanApproval,
        rightPanelTab: null,
        expandTimeline: true,
      };
    case "strategy":
      return {
        scrollAnchorId: semanticTimelineAnchorId("strategy"),
        panelId: RUNTIME_PANEL_IDS.strategy,
        focusSelector: RUNTIME_FOCUS_SELECTORS.strategyPrimary,
        rightPanelTab: null,
        expandTimeline: true,
      };
    case "execution":
      return {
        scrollAnchorId: semanticTimelineAnchorId("execution"),
        panelId: RUNTIME_PANEL_IDS.execution,
        focusSelector: RUNTIME_FOCUS_SELECTORS.executionPrimary,
        rightPanelTab: null,
        expandTimeline: true,
      };
    case "review":
      return {
        scrollAnchorId: semanticTimelineAnchorId("review"),
        panelId: RUNTIME_PANEL_IDS.review,
        focusSelector: null,
        rightPanelTab: null,
        expandTimeline: true,
      };
    case "observability":
      return {
        scrollAnchorId: null,
        panelId: RUNTIME_PANEL_IDS.observability,
        focusSelector: null,
        rightPanelTab: "observe",
        expandTimeline: false,
      };
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}
