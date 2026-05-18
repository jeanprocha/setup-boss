import type {
  ExecutionOrderingDto,
  StrategyBundleDto,
  StrategySubtaskDto,
} from "@/lib/runtime/strategy/strategy-types";

export function selectRootSubtasks(subtasks: StrategySubtaskDto[]): StrategySubtaskDto[] {
  return [...subtasks]
    .filter((s) => !s.parentId)
    .sort((a, b) => a.order - b.order);
}

export function selectChildSubtasks(
  subtasks: StrategySubtaskDto[],
  parentId: string,
): StrategySubtaskDto[] {
  return [...subtasks]
    .filter((s) => s.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

export function selectCriticalRisks(
  bundle: StrategyBundleDto,
  limit = 3,
): StrategyBundleDto["risks"] {
  const order = { high: 0, medium: 1, low: 2 };
  return [...bundle.risks]
    .sort((a, b) => order[a.level] - order[b.level])
    .slice(0, limit);
}

export function selectOrderingHighlights(ordering: ExecutionOrderingDto): {
  firstReady: string | null;
  nextPending: string | null;
  blockingCount: number;
} {
  const firstReady = ordering.readyIds[0] ?? null;
  const nextPending = ordering.pendingIds[0] ?? null;
  return {
    firstReady,
    nextPending,
    blockingCount: ordering.blockingDependencies.length,
  };
}

export function buildStrategyContextHighlights(bundle: StrategyBundleDto): {
  subtaskCount: number;
  readyCount: number;
  complexityLevel: string;
  mode: string;
  readiness: string;
  topRisk: string | null;
} {
  const risks = selectCriticalRisks(bundle, 1);
  return {
    subtaskCount: bundle.summary.subtaskCount,
    readyCount: bundle.summary.readySubtaskCount,
    complexityLevel: bundle.complexity.level,
    mode: bundle.recommendation.recommendedMode,
    readiness: bundle.summary.operationalReadiness,
    topRisk: risks[0]?.label ?? null,
  };
}

export function flattenSubtaskTree(
  subtasks: StrategySubtaskDto[],
  maxDepth = 2,
): StrategySubtaskDto[] {
  const roots = selectRootSubtasks(subtasks);
  const out: StrategySubtaskDto[] = [];
  for (const root of roots) {
    out.push(root);
    if (maxDepth > 1) {
      out.push(...selectChildSubtasks(subtasks, root.id));
    }
  }
  return out.slice(0, 12);
}
