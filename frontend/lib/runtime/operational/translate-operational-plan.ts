import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import { parseRefinedPlanPresentation } from "../clarification/parse-refined-plan.ts";
import type { StrategyBundleDto } from "../strategy/strategy-types.ts";
import {
  defaultComplexityExplanation,
  executionLevelDefinition,
  executionLevelFromMode,
} from "./operational-plan-execution-level.ts";
import {
  buildFallbackComplexity,
  buildFallbackExecutionRecommendation,
  buildScopeSignals,
} from "./operational-plan-fallbacks.ts";
import {
  buildHumanCompletionCriteria,
  buildHumanExecutionStrategy,
  buildHumanMainObjective,
  buildHumanMiniTasksSection,
  buildHumanRisks,
  buildHumanScopeExcluded,
  buildHumanUnderstandingSummary,
  buildHumanWhatWillBeDone,
  buildHumanWhatWillChange,
  dedupeUnderstanding,
  isInternalOperationalText,
} from "./operational-plan-humanize.ts";
import { sanitizeOperationalParagraph } from "./operational-plan-text-sanitize.ts";
import { buildOperationalPlanExecutableView } from "./operational-plan-executable-view.ts";
import type {
  OperationalPlanComplexity,
  OperationalPlanExecutionRecommendation,
  OperationalPlanPresentation,
  OperationalPlanRisk,
} from "./operational-plan-types.ts";

const COMPLEXITY_LABEL_PT: Record<OperationalPlanComplexity["level"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

const RISK_LEVEL_PT: Record<OperationalPlanRisk["level"], string> = {
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
};

function mapComplexity(
  strategy: StrategyBundleDto,
): OperationalPlanComplexity {
  const c = strategy.complexity;
  const level =
    c.level === "expert" ? "high" : (c.level as OperationalPlanComplexity["level"]);
  const rationale =
    c.rationale?.trim() && !isInternalOperationalText(c.rationale)
      ? c.rationale.trim()
      : null;

  const reason =
    rationale ??
    (c.estimatedDifficulty && !isInternalOperationalText(c.estimatedDifficulty)
      ? sanitizeOperationalParagraph(c.estimatedDifficulty)
      : null) ??
    defaultComplexityExplanation(level);

  return {
    level,
    levelLabelPt: COMPLEXITY_LABEL_PT[level],
    reason,
    explanation: reason,
  };
}

function mapExecutionRecommendation(
  strategy: StrategyBundleDto,
): OperationalPlanExecutionRecommendation {
  const rec = strategy.recommendation;
  const recommendedLevel = executionLevelFromMode(rec.recommendedMode);
  const def = executionLevelDefinition(recommendedLevel);

  const rationale =
    rec.rationale?.trim() && !isInternalOperationalText(rec.rationale)
      ? sanitizeOperationalParagraph(rec.rationale)
      : null;
  const impact =
    rec.operationalImpact?.trim() &&
    !isInternalOperationalText(rec.operationalImpact)
      ? sanitizeOperationalParagraph(rec.operationalImpact)
      : null;

  return {
    recommendedLevel,
    levelLabelPt: def.labelPt,
    explanation: rationale ?? impact ?? def.descriptionPt,
  };
}

function mapRisks(labels: string[]): OperationalPlanRisk[] {
  return labels.map((label, i) => ({
    id: `human-risk-${i}`,
    label,
    level: "medium" as const,
    levelLabelPt: RISK_LEVEL_PT.medium,
  }));
}

function planHasContent(plan: Omit<OperationalPlanPresentation, "hasContent">): boolean {
  return Boolean(
    plan.understanding.summary ||
      plan.understanding.mainObjective ||
      plan.whatWillBeDone.length > 0 ||
      plan.whatWillChange.length > 0 ||
      plan.outOfScope.length > 0 ||
      plan.executionStrategy.macroOrder.length > 0 ||
      plan.executionStrategy.approach ||
      plan.executionStrategy.dependencies.length > 0 ||
      plan.complexity ||
      plan.executionRecommendation ||
      plan.risks.length > 0 ||
      plan.miniTasks.mode === "divided" ||
      plan.completionCriteria.length > 0,
  );
}

/**
 * Traduz refinement + strategy (read-models reais) para plano operacional humano na UI.
 * Detalhes técnicos do runtime permanecem nos artefactos — não são expostos aqui.
 */
export function translateOperationalPlan(input: {
  clarification: ClarificationBundleDto;
  strategy?: StrategyBundleDto | null;
  planMarkdown?: string | null;
}): OperationalPlanPresentation {
  const { clarification, strategy, planMarkdown } = input;
  const refined = parseRefinedPlanPresentation(
    clarification.refinement,
    planMarkdown,
  );

  const understanding = dedupeUnderstanding({
    summary: buildHumanUnderstandingSummary(refined, clarification),
    mainObjective: buildHumanMainObjective(refined, clarification),
  });

  const whatWillBeDone = buildHumanWhatWillBeDone(
    refined,
    strategy,
    clarification,
  );
  const whatWillChange = buildHumanWhatWillChange(refined, clarification);
  const outOfScope = buildHumanScopeExcluded(refined, clarification);
  const executionStrategy = buildHumanExecutionStrategy(refined, strategy);
  const risks = mapRisks(buildHumanRisks(refined, strategy));
  const scopeSignals = buildScopeSignals({
    clarification,
    refined,
    whatWillBeDone,
    whatWillChange,
    outOfScope,
    risks: risks.map((r) => r.label),
    understandingSummary: understanding.summary,
    mainObjective: understanding.mainObjective,
  });
  const complexity =
    strategy && strategy.summary.source !== "unsupported"
      ? mapComplexity(strategy)
      : buildFallbackComplexity(scopeSignals);
  const executionRecommendation =
    strategy && strategy.summary.source !== "unsupported"
      ? mapExecutionRecommendation(strategy)
      : buildFallbackExecutionRecommendation(complexity, scopeSignals);
  const miniTasks = buildHumanMiniTasksSection(strategy);
  const completionCriteria = buildHumanCompletionCriteria(refined, clarification);
  const executableStrategyView = buildOperationalPlanExecutableView(
    strategy?.executableStrategy,
  );

  const core = {
    understanding,
    whatWillBeDone,
    whatWillChange,
    outOfScope,
    executionStrategy,
    complexity,
    executionRecommendation,
    risks,
    miniTasks,
    completionCriteria,
    executableStrategyView,
  };

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { polishOperationalPlanPresentation } =
    require("../../../../core/polish-operational-plan-presentation.js") as {
      polishOperationalPlanPresentation: (
        p: OperationalPlanPresentation,
      ) => OperationalPlanPresentation;
    };

  const polished = polishOperationalPlanPresentation({
    ...core,
    hasContent: false,
  });

  return {
    ...polished,
    executableStrategyView: core.executableStrategyView,
    hasContent: planHasContent(polished),
  };
}
