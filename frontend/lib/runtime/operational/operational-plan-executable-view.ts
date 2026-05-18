import type {
  OperationalExecutableImpactDto,
  OperationalExecutableMiniTaskDto,
  OperationalExecutableStrategyDto,
} from "../strategy/strategy-types.ts";
import {
  filterHumanMiniTaskTitle,
  isInternalOperationalText,
} from "./operational-plan-humanize.ts";
import { sanitizeOperationalParagraph, sanitizeOperationalText } from "./operational-plan-text-sanitize.ts";

const LEVEL_LABEL_PT = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
} as const;

const RISK_LABEL_PT = {
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
} as const;

const ORDERING_MODE_PT: Record<
  OperationalExecutableStrategyDto["orderingMode"],
  string
> = {
  linear: "Sequencial",
  staged: "Por etapas",
  parallel: "Paralelizável",
};

const EXECUTION_PATTERN_PT: Record<string, string> = {
  single_pass: "consolidada num único passo",
  sequential_by_step: "sequencial por etapas do plano",
  by_component: "isolada por componente ou domínio",
  refactor_then_feature: "com preparação estrutural antes da funcionalidade",
  incremental_validate: "com validação incremental após cada bloco",
};

const VALIDATION_APPROACH_PT: Record<string, string> = {
  per_mini_task: "ao final de cada etapa",
  end_only: "ao final da execução",
  visual_smoke: "com verificação visual pontual",
};

export type OperationalPlanExecutableMiniTaskView = {
  id: string;
  order: number;
  title: string;
  objective: string | null;
  scopeSummary: string | null;
  complexityLabelPt: string;
  riskLabelPt: string;
  completionCriteria: string[];
  dependencyLine: string | null;
};

export type OperationalPlanExpectedImpactView = {
  affectedFiles: string[];
  affectedComponents: string[];
  affectedModules: string[];
  structuralRiskLabelPt: string;
  visualRiskLabelPt: string;
  behaviorRiskLabelPt: string;
};

export type OperationalPlanExecutionStrategyRichView = {
  narrative: string | null;
  orderingModeLabelPt: string | null;
  executionPatternLabelPt: string | null;
  validationApproachLabelPt: string | null;
  macroOrder: string[];
};

export type OperationalPlanExecutableStrategyView = {
  mode: "full" | "degraded";
  degradedNotice: string | null;
  impactUnavailableNotice: string | null;
  miniTasks: OperationalPlanExecutableMiniTaskView[];
  expectedImpact: OperationalPlanExpectedImpactView | null;
  executionStrategy: OperationalPlanExecutionStrategyRichView | null;
};

export function buildOperationalPlanExecutableView(
  oes: OperationalExecutableStrategyDto | null | undefined,
): OperationalPlanExecutableStrategyView | null {
  if (!oes) return null;

  if (!oes.available || oes.degraded) {
    return {
      mode: "degraded",
      degradedNotice:
        "Estratégia executável detalhada indisponível para esta execução.",
      impactUnavailableNotice:
        "Impacto detalhado indisponível para esta execução.",
      miniTasks: [],
      expectedImpact: null,
      executionStrategy: null,
    };
  }

  const miniTasks = buildMiniTaskViews(oes);
  if (miniTasks.length === 0) return null;

  const expectedImpact = buildExpectedImpactView(oes.expectedImpact);
  const executionStrategy = buildExecutionStrategyRichView(oes, miniTasks);

  return {
    mode: "full",
    degradedNotice: null,
    impactUnavailableNotice: null,
    miniTasks,
    expectedImpact,
    executionStrategy,
  };
}

export function hasExpectedImpactContent(
  impact: OperationalPlanExpectedImpactView | null,
): boolean {
  if (!impact) return false;
  return (
    impact.affectedFiles.length > 0 ||
    impact.affectedComponents.length > 0 ||
    impact.affectedModules.length > 0
  );
}

export function shouldShowExpectedImpactSection(
  view: OperationalPlanExecutableStrategyView | null | undefined,
): boolean {
  if (!view) return false;
  if (view.mode === "degraded") return Boolean(view.impactUnavailableNotice);
  return hasExpectedImpactContent(view.expectedImpact);
}

function buildMiniTaskViews(
  oes: OperationalExecutableStrategyDto,
): OperationalPlanExecutableMiniTaskView[] {
  const sorted = [...oes.miniTasks]
    .filter((m) => filterHumanMiniTaskTitle(m.title))
    .sort((a, b) => a.order - b.order);

  const byId = new Map(sorted.map((m) => [m.id, m]));

  const depsByTarget = new Map<string, string[]>();
  for (const dep of oes.dependencies) {
    const list = depsByTarget.get(dep.toId) ?? [];
    list.push(dep.fromId);
    depsByTarget.set(dep.toId, list);
  }

  return sorted.map((task) => ({
    id: task.id,
    order: task.order,
    title: sanitizeOperationalText(task.title) ?? task.title.trim(),
    objective: sanitizeObjective(task.objective, task.title),
    scopeSummary: buildScopeSummary(task),
    complexityLabelPt: LEVEL_LABEL_PT[task.complexity] ?? "Média",
    riskLabelPt: RISK_LABEL_PT[task.risk] ?? "Médio",
    completionCriteria: filterCriteria([
      ...task.completionCriteria,
      ...task.acceptanceCriteria,
    ]),
    dependencyLine: buildDependencyLine(task, byId, depsByTarget),
  }));
}

function sanitizeObjective(objective: string, title: string): string | null {
  const raw = sanitizeOperationalParagraph(objective);
  if (!raw || isInternalOperationalText(raw)) return null;
  if (raw.toLowerCase() === title.trim().toLowerCase()) return raw;
  return raw;
}

function buildScopeSummary(task: OperationalExecutableMiniTaskDto): string | null {
  const summary = task.scope?.summary
    ? sanitizeOperationalParagraph(task.scope.summary)
    : null;
  if (summary && !isInternalOperationalText(summary)) return summary;

  const highlights = (task.scope?.highlights ?? [])
    .map((h) => sanitizeOperationalText(h))
    .filter((h): h is string => Boolean(h && !isInternalOperationalText(h)));

  if (highlights.length > 0) {
    return highlights.slice(0, 4).join(", ");
  }

  const domains = task.affectedDomains
    .map((d) => sanitizeOperationalText(d))
    .filter((d): d is string => Boolean(d));
  if (domains.length > 0) return domains.join(", ");

  const files = task.affectedFiles
    .map((f) => sanitizeOperationalText(f))
    .filter((f): f is string => Boolean(f && !isInternalOperationalText(f)));
  if (files.length > 0) return files.slice(0, 3).join(", ");

  return null;
}

function filterCriteria(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const t = sanitizeOperationalText(item);
    if (!t || isInternalOperationalText(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 8);
}

function buildDependencyLine(
  task: OperationalExecutableMiniTaskDto,
  byId: Map<string, OperationalExecutableMiniTaskDto>,
  depsByTarget: Map<string, string[]>,
): string | null {
  const depIds = uniqueIds([
    ...task.dependsOnIds,
    ...(depsByTarget.get(task.id) ?? []),
  ]);

  const labels = depIds
    .map((id) => {
      const dep = byId.get(id);
      if (!dep) return null;
      const title = sanitizeOperationalText(dep.title) ?? dep.title.trim();
      return `Mini-tarefa ${dep.order} — ${title}`;
    })
    .filter((l): l is string => Boolean(l));

  if (labels.length === 0) return null;
  return `Depende de: ${labels.join("; ")}`;
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const k = id.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function buildExpectedImpactView(
  impact: OperationalExecutableImpactDto,
): OperationalPlanExpectedImpactView | null {
  const affectedFiles = filterImpactList(impact.affectedFiles);
  const affectedComponents = filterImpactList(impact.affectedComponents);
  const affectedModules = filterImpactList(impact.affectedModules);

  const view: OperationalPlanExpectedImpactView = {
    affectedFiles,
    affectedComponents,
    affectedModules,
    structuralRiskLabelPt: RISK_LABEL_PT[impact.structuralRisk] ?? "Médio",
    visualRiskLabelPt: RISK_LABEL_PT[impact.visualRisk] ?? "Médio",
    behaviorRiskLabelPt: RISK_LABEL_PT[impact.behaviorRisk] ?? "Médio",
  };

  if (!hasExpectedImpactContent(view)) return null;
  return view;
}

function filterImpactList(items: string[]): string[] {
  return items
    .map((item) => sanitizeOperationalText(item))
    .filter((item): item is string => Boolean(item && !isInternalOperationalText(item)))
    .slice(0, 12);
}

function buildExecutionStrategyRichView(
  oes: OperationalExecutableStrategyDto,
  miniTasks: OperationalPlanExecutableMiniTaskView[],
): OperationalPlanExecutionStrategyRichView {
  const byId = new Map(miniTasks.map((m) => [m.id, m]));
  const macroOrder = oes.macroOrder
    .map((id) => byId.get(id)?.title)
    .filter((t): t is string => Boolean(t));

  const orderingModeLabelPt = ORDERING_MODE_PT[oes.orderingMode] ?? null;
  const executionPatternLabelPt =
    EXECUTION_PATTERN_PT[oes.executionPattern] ??
    (oes.executionPattern
      ? sanitizeOperationalParagraph(oes.executionPattern.replace(/_/g, " "))
      : null);
  const validationApproachLabelPt =
    VALIDATION_APPROACH_PT[oes.validationApproach] ??
    (oes.validationApproach
      ? sanitizeOperationalParagraph(oes.validationApproach.replace(/_/g, " "))
      : null);

  return {
    narrative: buildExecutionNarrative({
      orderingModeLabelPt,
      executionPatternLabelPt,
      validationApproachLabelPt,
      hasMiniTasks: miniTasks.length > 0,
    }),
    orderingModeLabelPt,
    executionPatternLabelPt,
    validationApproachLabelPt,
    macroOrder:
      macroOrder.length > 0
        ? macroOrder
        : miniTasks.map((m) => m.title),
  };
}

function buildExecutionNarrative(input: {
  orderingModeLabelPt: string | null;
  executionPatternLabelPt: string | null;
  validationApproachLabelPt: string | null;
  hasMiniTasks: boolean;
}): string | null {
  const parts: string[] = [];

  if (input.orderingModeLabelPt) {
    const mode =
      input.orderingModeLabelPt === "Sequencial"
        ? "sequencial"
        : input.orderingModeLabelPt === "Por etapas"
          ? "por etapas"
          : "paralelizável";
    parts.push(`A execução será ${mode}`);
    if (input.hasMiniTasks) {
      parts.push("seguindo a ordem das mini-tarefas abaixo");
    }
  }

  if (input.executionPatternLabelPt && !parts.length) {
    parts.push(`O padrão de execução será ${input.executionPatternLabelPt}`);
  }

  if (input.validationApproachLabelPt) {
    parts.push(`A validação será feita ${input.validationApproachLabelPt}`);
  }

  if (parts.length === 0) return null;
  return `${parts.join(", ")}.`;
}
