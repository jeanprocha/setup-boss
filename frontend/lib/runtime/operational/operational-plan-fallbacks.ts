import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { RefinedPlanPresentation } from "../clarification/parse-refined-plan.ts";
import type {
  OperationalPlanComplexity,
  OperationalPlanExecutionRecommendation,
} from "./operational-plan-types.ts";
import {
  defaultComplexityExplanation,
  executionLevelDefinition,
  type ExecutionLevelId,
} from "./operational-plan-execution-level.ts";

export type OperationalPlanScopeSignals = {
  whatWillBeDone: string[];
  whatWillChange: string[];
  outOfScope: string[];
  risks: string[];
  understandingSummary: string | null;
  mainObjective: string | null;
};

const COMPLEXITY_LABEL_PT: Record<OperationalPlanComplexity["level"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

function scopeText(signals: OperationalPlanScopeSignals): string {
  return [
    signals.understandingSummary,
    signals.mainObjective,
    ...signals.whatWillBeDone,
    ...signals.whatWillChange,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function pickScopeHint(signals: OperationalPlanScopeSignals): string | null {
  for (const item of signals.whatWillBeDone) {
    const t = item.trim();
    if (t.length >= 8) return t;
  }
  for (const item of signals.whatWillChange) {
    const t = item.trim();
    if (t.length >= 8) return t;
  }
  const summary = signals.understandingSummary?.trim();
  if (summary && summary.length >= 8) return summary;
  const objective = signals.mainObjective?.trim();
  if (objective && objective.length >= 8) return objective;
  const task = signals.mainObjective?.trim();
  return task || null;
}

function truncateHint(text: string, max = 110): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

/** Infere complexidade a partir do escopo humano do plano (sem strategy). */
export function inferComplexityLevelFromScope(
  signals: OperationalPlanScopeSignals,
): OperationalPlanComplexity["level"] {
  const itemCount = signals.whatWillBeDone.length + signals.whatWillChange.length;
  const riskCount = signals.risks.length;
  const text = scopeText(signals);

  const structural =
    /arquitet|módulo|modulo|backend|api|migra|refator|regra(s)? de negócio|estrutur|pipeline|daemon|runtime/i.test(
      text,
    );
  const trivial =
    itemCount <= 1 &&
    riskCount === 0 &&
    !structural &&
    /texto|copy|label|ajuste pontual|corrigir typo/i.test(text);

  if (structural || riskCount >= 3 || itemCount >= 6) return "high";
  if (trivial) return "low";
  return "medium";
}

export function buildScopeBasedComplexityExplanation(
  level: OperationalPlanComplexity["level"],
  signals: OperationalPlanScopeSignals,
): string {
  const hint = pickScopeHint(signals);
  if (hint) {
    const short = truncateHint(hint);
    if (level === "low") {
      return `alteração localizada: ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
    }
    if (level === "high") {
      return `impacto relevante no escopo: ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
    }
    if (/componente|visual|tela|integra/i.test(short)) {
      return `envolve ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
    }
    return short.charAt(0).toUpperCase() + short.slice(1);
  }
  return defaultComplexityExplanation(level);
}

export function buildFallbackComplexity(
  signals: OperationalPlanScopeSignals,
): OperationalPlanComplexity {
  const level = inferComplexityLevelFromScope(signals);
  const reason = buildScopeBasedComplexityExplanation(level, signals);
  return {
    level,
    levelLabelPt: COMPLEXITY_LABEL_PT[level],
    reason,
    explanation: reason,
  };
}

function recommendedLevelForComplexity(
  level: OperationalPlanComplexity["level"],
): ExecutionLevelId {
  if (level === "low") return "low";
  if (level === "high") return "high";
  return "normal";
}

export function buildFallbackExecutionRecommendation(
  complexity: OperationalPlanComplexity,
  signals: OperationalPlanScopeSignals,
): OperationalPlanExecutionRecommendation {
  const recommendedLevel = recommendedLevelForComplexity(complexity.level);
  const def = executionLevelDefinition(recommendedLevel);

  let explanation: string;
  if (complexity.level === "medium") {
    explanation =
      "equilíbrio entre qualidade, contexto e custo para esta atividade.";
  } else if (complexity.level === "low") {
    explanation =
      "prioriza velocidade e baixo custo operacional para entregas localizadas.";
  } else {
    explanation =
      "maior profundidade de análise e validação para o escopo identificado.";
  }

  const hint = pickScopeHint(signals);
  if (hint && complexity.level === "medium" && /componente|visual|integra/i.test(hint)) {
    explanation = `equilíbrio entre qualidade, contexto e custo para ${truncateHint(hint, 80).charAt(0).toLowerCase()}${truncateHint(hint, 80).slice(1)}.`;
  }

  return {
    recommendedLevel,
    levelLabelPt: def.labelPt,
    explanation,
  };
}

export function buildScopeSignals(input: {
  clarification: ClarificationBundleDto;
  refined: RefinedPlanPresentation;
  whatWillBeDone: string[];
  whatWillChange: string[];
  outOfScope: string[];
  risks: string[];
  understandingSummary: string | null;
  mainObjective: string | null;
}): OperationalPlanScopeSignals {
  return {
    whatWillBeDone: input.whatWillBeDone,
    whatWillChange: input.whatWillChange,
    outOfScope: input.outOfScope,
    risks: input.risks,
    understandingSummary: input.understandingSummary,
    mainObjective: input.mainObjective,
  };
}
