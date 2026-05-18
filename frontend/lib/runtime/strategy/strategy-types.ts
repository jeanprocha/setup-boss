/** DTOs mínimos — Strategy Runtime (read-only, operacional). */

export type ComplexityLevel = "low" | "medium" | "high" | "expert";

export type StrategyRuntimePhase =
  | "strategy_pending"
  | "strategy_generating"
  | "strategy_ready"
  | "strategy_blocked"
  | "strategy_failed"
  | "strategy_approved"
  | "ready_for_execution"
  | "unavailable";

export type StrategySubtaskState =
  | "planned"
  | "ready"
  | "blocked"
  | "pending"
  | "skipped";

export type StrategySummaryDto = {
  runId: string;
  label: string;
  runtimePhase: StrategyRuntimePhase;
  phase3Status: string | null;
  subtaskCount: number;
  readySubtaskCount: number;
  blockingCount: number;
  operationalReadiness: "not_ready" | "partial" | "ready";
  updatedAt: string | null;
  /** runtime | mock | partial | unsupported */
  source: "runtime" | "mock" | "partial" | "unsupported";
  unsupportedReason: string | null;
};

export type ComplexityDto = {
  level: ComplexityLevel;
  estimatedDifficulty: string;
  executionRisk: "low" | "medium" | "high";
  runtimeLoad: "light" | "moderate" | "heavy";
  coordinationComplexity: "low" | "medium" | "high";
  rationale: string | null;
};

export type AIRecommendationDto = {
  recommendedMode: "basic" | "standard" | "expert";
  modelStrategy: string;
  executionApproach: string;
  rationale: string;
  operationalImpact: string;
  costPerformanceHint: string | null;
};

export type StrategySubtaskScopeDto = {
  summary: string | null;
  highlights: string[];
};

export type StrategySubtaskDto = {
  id: string;
  title: string;
  parentId: string | null;
  order: number;
  state: StrategySubtaskState;
  dependsOn: string[];
  ownership: string | null;
  readiness: "not_ready" | "ready" | "blocked";
  blockerLabel: string | null;
  /** ID canónico OES: mini-{order}-{slug} */
  miniTaskId?: string | null;
  objective?: string | null;
  scope?: StrategySubtaskScopeDto;
  affectedFiles?: string[];
  affectedDomains?: string[];
  dependsOnMiniTaskIds?: string[];
  complexity?: "low" | "medium" | "high";
  risk?: "low" | "medium" | "high";
  acceptanceCriteria?: string[];
  completionCriteria?: string[];
  validationHints?: string[];
};

export type OperationalExecutableDependencyDto = {
  fromId: string;
  toId: string;
  label: string;
  kind: "blocks" | "requires" | "soft";
};

export type OperationalExecutableImpactDto = {
  affectedFiles: string[];
  affectedComponents: string[];
  affectedModules: string[];
  structuralRisk: "low" | "medium" | "high";
  visualRisk: "low" | "medium" | "high";
  behaviorRisk: "low" | "medium" | "high";
  summary: string | null;
};

export type OperationalExecutableMiniTaskDto = {
  id: string;
  subtaskId: string | null;
  order: number;
  title: string;
  objective: string;
  scope: StrategySubtaskScopeDto;
  affectedFiles: string[];
  affectedDomains: string[];
  dependsOnIds: string[];
  complexity: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  acceptanceCriteria: string[];
  completionCriteria: string[];
  validationHints: string[];
};

export type OperationalExecutableStrategyDto = {
  available: boolean;
  degraded: boolean;
  version: number;
  planVersion: string;
  sourcePlanVersion: string;
  strategySha256: string | null;
  orderingMode: "linear" | "parallel" | "staged";
  executionPattern: string;
  macroOrder: string[];
  dependencies: OperationalExecutableDependencyDto[];
  validationApproach: string;
  expectedImpact: OperationalExecutableImpactDto;
  miniTasks: OperationalExecutableMiniTaskDto[];
  approvalState: {
    approved: boolean;
    strategySha256: string | null;
  };
};

export type ExecutionOrderingDto = {
  orderingMode: "linear" | "parallel" | "staged";
  sequence: {
    position: number;
    subtaskId: string;
    title: string;
    dependsOn: string[];
    status: "ready" | "pending" | "blocked";
  }[];
  readyIds: string[];
  pendingIds: string[];
  blockingDependencies: { from: string; to: string; label: string }[];
};

export type SharedContextDto = {
  artifacts: string[];
  constraints: string[];
  rules: string[];
  crossSubtaskDeps: { subtaskId: string; refs: string[] }[];
};

export type StrategyRiskDto = {
  id: string;
  label: string;
  level: "low" | "medium" | "high";
};

export type StrategyBundleDto = {
  summary: StrategySummaryDto;
  complexity: ComplexityDto;
  recommendation: AIRecommendationDto;
  subtasks: StrategySubtaskDto[];
  ordering: ExecutionOrderingDto;
  sharedContext: SharedContextDto;
  risks: StrategyRiskDto[];
  decompositionSummary: string | null;
  /** Artefato canónico projetado — fonte única para estratégia executável (Slice 2+). */
  executableStrategy: OperationalExecutableStrategyDto | null;
};

export type StrategyAvailability = {
  readable: boolean;
  degraded: boolean;
  blockedReason: string | null;
};

export type StrategyCorrelationTarget =
  | "timeline"
  | "stream"
  | "clarification"
  | "execution";
