/** Modelo de apresentação do plano operacional (validação humana antes da execução). */

import type { ExecutionLevelId } from "./operational-plan-execution-level.ts";

export type OperationalPlanRisk = {
  id: string;
  label: string;
  level: "low" | "medium" | "high";
  levelLabelPt: string;
};

export type OperationalPlanMiniTask = {
  id: string;
  title: string;
  order: number;
};

export type OperationalPlanUnderstanding = {
  summary: string | null;
  mainObjective: string | null;
};

export type OperationalPlanExecutionStrategy = {
  macroOrder: string[];
  approach: string | null;
  dependencies: string[];
};

export type OperationalPlanComplexity = {
  level: "low" | "medium" | "high";
  levelLabelPt: string;
  /** Motivo puro — sem prefixo «A tarefa foi avaliada…». */
  reason: string | null;
  /** Legado: mesmo conteúdo que `reason` em planos normalizados. */
  explanation: string | null;
};

export type OperationalPlanExecutionRecommendation = {
  /** Nível recomendado pelo Setup Boss (low | normal | high). */
  recommendedLevel: ExecutionLevelId;
  levelLabelPt: string;
  explanation: string | null;
};

export type OperationalPlanMiniTasksSection = {
  mode: "divided" | "direct";
  directLabelPt: string;
  tasks: OperationalPlanMiniTask[];
};

import type { OperationalPlanExecutableStrategyView } from "./operational-plan-executable-view.ts";

export type {
  OperationalPlanExecutableStrategyView,
  OperationalPlanExecutableMiniTaskView,
  OperationalPlanExpectedImpactView,
  OperationalPlanExecutionStrategyRichView,
} from "./operational-plan-executable-view.ts";

export type OperationalPlanPresentation = {
  understanding: OperationalPlanUnderstanding;
  whatWillBeDone: string[];
  whatWillChange: string[];
  outOfScope: string[];
  executionStrategy: OperationalPlanExecutionStrategy;
  complexity: OperationalPlanComplexity;
  executionRecommendation: OperationalPlanExecutionRecommendation;
  miniTasks: OperationalPlanMiniTasksSection;
  risks: OperationalPlanRisk[];
  completionCriteria: string[];
  /** Projeção UI da estratégia executável (OES) — ausente em planos legados sem strategy. */
  executableStrategyView?: OperationalPlanExecutableStrategyView | null;
  hasContent: boolean;
};
