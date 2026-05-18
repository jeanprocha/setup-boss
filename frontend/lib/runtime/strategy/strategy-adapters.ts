import type {
  AIRecommendationDto,
  ComplexityDto,
  ComplexityLevel,
  ExecutionOrderingDto,
  OperationalExecutableStrategyDto,
  SharedContextDto,
  StrategyBundleDto,
  StrategyRiskDto,
  StrategySubtaskDto,
  StrategySubtaskScopeDto,
  StrategySubtaskState,
} from "@/lib/runtime/strategy/strategy-types";
import { mapPhase3StatusToRuntimePhase } from "@/lib/runtime/strategy/strategy-state";

type ApiJson = {
  ok?: boolean;
  data?: Record<string, unknown>;
};

function str(v: unknown): string {
  return v != null ? String(v) : "";
}

function mapComplexityLevel(raw: unknown): ComplexityLevel {
  const k = String(raw || "").toLowerCase();
  if (k === "low" || k === "simple") return "low";
  if (k === "high" || k === "complex") return "high";
  if (k === "expert") return "expert";
  if (k === "moderate" || k === "medium") return "medium";
  return "medium";
}

function mapComplexity(raw: Record<string, unknown> | undefined): ComplexityDto {
  const level = mapComplexityLevel(raw?.level ?? raw?.classification);
  const scores = raw?.scores as Record<string, unknown> | undefined;
  const risk = raw?.executionRisk ?? scores?.risk;
  const er =
    risk === "low" || risk === "medium" || risk === "high"
      ? risk
      : level === "low"
        ? "low"
        : level === "expert" || level === "high"
          ? "high"
          : "medium";
  return {
    level,
    estimatedDifficulty: str(raw?.estimatedDifficulty ?? raw?.classification) || level,
    executionRisk: er,
    runtimeLoad:
      raw?.runtimeLoad === "light" ||
      raw?.runtimeLoad === "moderate" ||
      raw?.runtimeLoad === "heavy"
        ? raw.runtimeLoad
        : level === "low"
          ? "light"
          : level === "expert"
            ? "heavy"
            : "moderate",
    coordinationComplexity:
      raw?.coordinationComplexity === "low" ||
      raw?.coordinationComplexity === "medium" ||
      raw?.coordinationComplexity === "high"
        ? raw.coordinationComplexity
        : level === "expert"
          ? "high"
          : "medium",
    rationale: raw?.rationale != null ? str(raw.rationale) : null,
  };
}

function mapRecommendation(raw: Record<string, unknown> | undefined): AIRecommendationDto {
  const modeRaw = raw?.recommendedMode ?? raw?.recommended_mode;
  const mode =
    modeRaw === "basic" || modeRaw === "standard" || modeRaw === "expert"
      ? modeRaw
      : "standard";
  return {
    recommendedMode: mode,
    modelStrategy: str(raw?.modelStrategy ?? raw?.model_strategy) || `${mode} pipeline`,
    executionApproach:
      str(raw?.executionApproach ?? raw?.execution_approach) ||
      "Decomposição linear com gates de review",
    rationale:
      str(raw?.rationale) ||
      "Modo derivado da análise de complexidade e superfície de alteração.",
    operationalImpact:
      str(raw?.operationalImpact ?? raw?.operational_impact) ||
      "Define paralelismo, profundidade de review e custo de tokens.",
    costPerformanceHint:
      raw?.costPerformanceHint != null
        ? str(raw.costPerformanceHint)
        : raw?.cost_performance_hint != null
          ? str(raw.cost_performance_hint)
          : null,
  };
}

function mapSubtaskState(raw: unknown): StrategySubtaskState {
  const k = String(raw || "").toLowerCase();
  if (k === "ready" || k === "planned" || k === "blocked" || k === "pending" || k === "skipped") {
    return k;
  }
  return "planned";
}

function level3(raw: unknown): "low" | "medium" | "high" {
  const k = String(raw || "").toLowerCase();
  if (k === "low") return "low";
  if (k === "high") return "high";
  return "medium";
}

function mapScope(raw: unknown): StrategySubtaskScopeDto {
  if (!raw || typeof raw !== "object") {
    return { summary: null, highlights: [] };
  }
  const r = raw as Record<string, unknown>;
  return {
    summary: r.summary != null ? str(r.summary) || null : null,
    highlights: Array.isArray(r.highlights) ? r.highlights.map((x) => str(x)).filter(Boolean) : [],
  };
}

function mapSubtasks(raw: unknown): StrategySubtaskDto[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    const r = item as Record<string, unknown>;
    const readiness = r.readiness;
    const rd =
      readiness === "ready" || readiness === "blocked" || readiness === "not_ready"
        ? readiness
        : "not_ready";
    const base: StrategySubtaskDto = {
      id: str(r.id ?? r.subtask_id ?? `st-${idx + 1}`),
      title: str(r.title) || `subtask-${idx + 1}`,
      parentId: r.parentId != null ? str(r.parentId) : r.parent_id != null ? str(r.parent_id) : null,
      order: typeof r.order === "number" ? r.order : typeof r.position === "number" ? r.position : idx + 1,
      state: mapSubtaskState(r.state ?? r.status),
      dependsOn: Array.isArray(r.dependsOn)
        ? r.dependsOn.map((d) => str(d))
        : Array.isArray(r.depends_on)
          ? r.depends_on.map((d) => str(d))
          : [],
      ownership: r.ownership != null ? str(r.ownership) : null,
      readiness: rd,
      blockerLabel: r.blockerLabel != null ? str(r.blockerLabel) : r.blocker_label != null ? str(r.blocker_label) : null,
    };
    if (r.miniTaskId != null || r.mini_task_id != null) {
      base.miniTaskId = str(r.miniTaskId ?? r.mini_task_id) || null;
    }
    if (r.objective != null) base.objective = str(r.objective) || null;
    if (r.scope != null) base.scope = mapScope(r.scope);
    if (Array.isArray(r.affectedFiles)) base.affectedFiles = r.affectedFiles.map((x) => str(x)).filter(Boolean);
    if (Array.isArray(r.affectedDomains)) {
      base.affectedDomains = r.affectedDomains.map((x) => str(x)).filter(Boolean);
    }
    if (Array.isArray(r.dependsOnMiniTaskIds)) {
      base.dependsOnMiniTaskIds = r.dependsOnMiniTaskIds.map((x) => str(x)).filter(Boolean);
    }
    if (r.complexity != null) base.complexity = level3(r.complexity);
    if (r.risk != null) base.risk = level3(r.risk);
    if (Array.isArray(r.acceptanceCriteria)) {
      base.acceptanceCriteria = r.acceptanceCriteria.map((x) => str(x)).filter(Boolean);
    }
    if (Array.isArray(r.completionCriteria)) {
      base.completionCriteria = r.completionCriteria.map((x) => str(x)).filter(Boolean);
    }
    if (Array.isArray(r.validationHints)) {
      base.validationHints = r.validationHints.map((x) => str(x)).filter(Boolean);
    }
    return base;
  });
}

function mapExecutableStrategy(raw: unknown): OperationalExecutableStrategyDto | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const approval =
    r.approvalState && typeof r.approvalState === "object"
      ? (r.approvalState as Record<string, unknown>)
      : {};
  const strategySha256 =
    approval.strategySha256 != null ? str(approval.strategySha256) || null : null;

  const miniTasks = Array.isArray(r.miniTasks)
    ? r.miniTasks
        .map((item) => {
          const m = item as Record<string, unknown>;
          const title = str(m.title);
          if (!title) return null;
          return {
            id: str(m.id),
            subtaskId: m.subtaskId != null ? str(m.subtaskId) || null : null,
            order: typeof m.order === "number" ? m.order : 1,
            title,
            objective: str(m.objective) || title,
            scope: mapScope(m.scope),
            affectedFiles: Array.isArray(m.affectedFiles)
              ? m.affectedFiles.map((x) => str(x)).filter(Boolean)
              : [],
            affectedDomains: Array.isArray(m.affectedDomains)
              ? m.affectedDomains.map((x) => str(x)).filter(Boolean)
              : [],
            dependsOnIds: Array.isArray(m.dependsOnIds)
              ? m.dependsOnIds.map((x) => str(x)).filter(Boolean)
              : [],
            complexity: level3(m.complexity),
            risk: level3(m.risk),
            acceptanceCriteria: Array.isArray(m.acceptanceCriteria)
              ? m.acceptanceCriteria.map((x) => str(x)).filter(Boolean)
              : [],
            completionCriteria: Array.isArray(m.completionCriteria)
              ? m.completionCriteria.map((x) => str(x)).filter(Boolean)
              : [],
            validationHints: Array.isArray(m.validationHints)
              ? m.validationHints.map((x) => str(x)).filter(Boolean)
              : [],
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
    : [];

  const orderingModeRaw = str(r.orderingMode);
  const orderingMode =
    orderingModeRaw === "parallel" || orderingModeRaw === "staged" || orderingModeRaw === "linear"
      ? orderingModeRaw
      : "linear";

  const impact =
    r.expectedImpact && typeof r.expectedImpact === "object"
      ? (r.expectedImpact as Record<string, unknown>)
      : {};

  if (r.available === false) {
    return {
      available: false,
      degraded: true,
      version: 1,
      planVersion: "v1",
      sourcePlanVersion: "v1",
      strategySha256: null,
      orderingMode: "linear",
      executionPattern: "sequential_by_step",
      macroOrder: [],
      dependencies: [],
      validationApproach: "end_only",
      expectedImpact: {
        affectedFiles: [],
        affectedComponents: [],
        affectedModules: [],
        structuralRisk: "medium",
        visualRisk: "medium",
        behaviorRisk: "medium",
        summary: null,
      },
      miniTasks: [],
      approvalState: { approved: false, strategySha256: null },
    };
  }

  return {
    available: true,
    degraded: r.degraded === true,
    version: typeof r.version === "number" ? r.version : 1,
    planVersion: str(r.planVersion) || "v1",
    sourcePlanVersion: str(r.sourcePlanVersion) || str(r.planVersion) || "v1",
    strategySha256,
    orderingMode,
    executionPattern: str(r.executionPattern) || "sequential_by_step",
    macroOrder: Array.isArray(r.macroOrder) ? r.macroOrder.map((x) => str(x)).filter(Boolean) : [],
    dependencies: Array.isArray(r.dependencies)
      ? r.dependencies
          .map((item) => {
            const d = item as Record<string, unknown>;
            const fromId = str(d.fromId);
            const toId = str(d.toId);
            if (!fromId || !toId) return null;
            const kindRaw = str(d.kind);
            const kind =
              kindRaw === "requires" || kindRaw === "soft" || kindRaw === "blocks"
                ? kindRaw
                : "blocks";
            return {
              fromId,
              toId,
              label: str(d.label) || `${toId} depende de ${fromId}`,
              kind,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x != null)
      : [],
    validationApproach: str(r.validationApproach) || "end_only",
    expectedImpact: {
      affectedFiles: Array.isArray(impact.affectedFiles)
        ? impact.affectedFiles.map((x) => str(x)).filter(Boolean)
        : [],
      affectedComponents: Array.isArray(impact.affectedComponents)
        ? impact.affectedComponents.map((x) => str(x)).filter(Boolean)
        : [],
      affectedModules: Array.isArray(impact.affectedModules)
        ? impact.affectedModules.map((x) => str(x)).filter(Boolean)
        : [],
      structuralRisk: level3(impact.structuralRisk),
      visualRisk: level3(impact.visualRisk),
      behaviorRisk: level3(impact.behaviorRisk),
      summary: impact.summary != null ? str(impact.summary) || null : null,
    },
    miniTasks,
    approvalState: {
      approved: approval.approved === true,
      strategySha256,
    },
  };
}

function mapOrdering(raw: Record<string, unknown> | undefined, subtasks: StrategySubtaskDto[]): ExecutionOrderingDto {
  const modeRaw = raw?.orderingMode ?? raw?.ordering_mode;
  const orderingMode =
    modeRaw === "parallel" || modeRaw === "staged" || modeRaw === "linear"
      ? modeRaw
      : "linear";
  const ordered = Array.isArray(raw?.sequence)
    ? raw.sequence
    : Array.isArray(raw?.ordered_subtasks)
      ? raw.ordered_subtasks
      : [];
  const sequence = ordered.map((item, idx) => {
    const r = item as Record<string, unknown>;
    const subtaskId = str(r.subtaskId ?? r.subtask_id ?? r.id);
    const st = subtasks.find((s) => s.id === subtaskId);
    const dep = Array.isArray(r.dependsOn)
      ? r.dependsOn.map((d) => str(d))
      : Array.isArray(r.depends_on)
        ? r.depends_on.map((d) => str(d))
        : [];
    const statusRaw = r.status ?? st?.readiness;
    const status =
      statusRaw === "ready" || statusRaw === "blocked"
        ? statusRaw
        : dep.length > 0 && st?.readiness === "blocked"
          ? "blocked"
          : "pending";
    return {
      position: typeof r.position === "number" ? r.position : idx + 1,
      subtaskId,
      title: str(r.title) || st?.title || subtaskId,
      dependsOn: dep,
      status: status as "ready" | "pending" | "blocked",
    };
  });
  const readyIds = sequence.filter((s) => s.status === "ready").map((s) => s.subtaskId);
  const pendingIds = sequence.filter((s) => s.status === "pending").map((s) => s.subtaskId);
  const blockingDependencies: ExecutionOrderingDto["blockingDependencies"] = [];
  for (const row of sequence) {
    for (const dep of row.dependsOn) {
      blockingDependencies.push({
        from: dep,
        to: row.subtaskId,
        label: `${dep} → ${row.subtaskId}`,
      });
    }
  }
  return {
    orderingMode,
    sequence,
    readyIds: Array.isArray(raw?.readyIds) ? raw.readyIds.map((x) => str(x)) : readyIds,
    pendingIds: Array.isArray(raw?.pendingIds) ? raw.pendingIds.map((x) => str(x)) : pendingIds,
    blockingDependencies,
  };
}

function mapSharedContext(raw: Record<string, unknown> | undefined): SharedContextDto {
  return {
    artifacts: Array.isArray(raw?.artifacts)
      ? raw.artifacts.map((x) => str(x))
      : Array.isArray(raw?.context_refs)
        ? raw.context_refs.map((x) => str(x))
        : [],
    constraints: Array.isArray(raw?.constraints)
      ? raw.constraints.map((x) => str(x))
      : [],
    rules: Array.isArray(raw?.rules) ? raw.rules.map((x) => str(x)) : [],
    crossSubtaskDeps: Array.isArray(raw?.crossSubtaskDeps)
      ? raw.crossSubtaskDeps.map((item) => {
          const r = item as Record<string, unknown>;
          return {
            subtaskId: str(r.subtaskId),
            refs: Array.isArray(r.refs) ? r.refs.map((x) => str(x)) : [],
          };
        })
      : [],
  };
}

function mapRisks(raw: unknown): StrategyRiskDto[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    const r = item as Record<string, unknown>;
    const levelRaw = r.level;
    const level =
      levelRaw === "low" || levelRaw === "medium" || levelRaw === "high"
        ? levelRaw
        : levelRaw === "med"
          ? "medium"
          : "medium";
    return {
      id: str(r.id) || `risk-${idx + 1}`,
      label: str(r.label) || "Risco não rotulado",
      level,
    };
  });
}

/**
 * Bundle “unsupported” alinhado ao contrato UI — sem mocks de demo.
 * Usado quando GET /runs/:id/strategy devolve 404 ou corpo sem `data` válido.
 */
export function buildUnsupportedStrategyBundle(
  runId: string,
  reason: string,
): StrategyBundleDto {
  return {
    summary: {
      runId,
      label: runId,
      runtimePhase: "unavailable",
      phase3Status: null,
      subtaskCount: 0,
      readySubtaskCount: 0,
      blockingCount: 0,
      operationalReadiness: "not_ready",
      updatedAt: null,
      source: "unsupported",
      unsupportedReason: reason,
    },
    complexity: {
      level: "medium",
      estimatedDifficulty: "—",
      executionRisk: "medium",
      runtimeLoad: "moderate",
      coordinationComplexity: "medium",
      rationale: null,
    },
    recommendation: {
      recommendedMode: "standard",
      modelStrategy: "—",
      executionApproach: "—",
      rationale: "—",
      operationalImpact: "—",
      costPerformanceHint: null,
    },
    subtasks: [],
    ordering: {
      orderingMode: "linear",
      sequence: [],
      readyIds: [],
      pendingIds: [],
      blockingDependencies: [],
    },
    sharedContext: {
      artifacts: [],
      constraints: [],
      rules: [],
      crossSubtaskDeps: [],
    },
    risks: [],
    decompositionSummary: null,
    executableStrategy: null,
  };
}

export function mapApiStrategyBundle(
  json: ApiJson,
  runId: string,
): StrategyBundleDto | null {
  if (!json.ok || !json.data) return null;
  const d = json.data;
  const summaryRaw = (d.summary as Record<string, unknown>) ?? {};
  const phase3Status =
    summaryRaw.phase3Status != null
      ? str(summaryRaw.phase3Status)
      : summaryRaw.phase3_status != null
        ? str(summaryRaw.phase3_status)
        : null;
  const blockingCount =
    typeof summaryRaw.blockingCount === "number"
      ? summaryRaw.blockingCount
      : typeof summaryRaw.blocking_count === "number"
        ? summaryRaw.blocking_count
        : 0;
  const readinessRaw = summaryRaw.operationalReadiness ?? summaryRaw.operational_readiness;
  const operationalReadiness =
    readinessRaw === "ready" || readinessRaw === "partial" || readinessRaw === "not_ready"
      ? readinessRaw
      : "partial";

  const subtasks = mapSubtasks(d.subtasks);
  const ordering = mapOrdering(
    (d.ordering as Record<string, unknown>) ?? d.executionOrder,
    subtasks,
  );
  const readySubtaskCount =
    typeof summaryRaw.readySubtaskCount === "number"
      ? summaryRaw.readySubtaskCount
      : subtasks.filter((s) => s.readiness === "ready").length;

  const runtimePhase = mapPhase3StatusToRuntimePhase(
    phase3Status,
    operationalReadiness,
    blockingCount,
  );

  const sourceRaw = summaryRaw.source ?? d.source;
  const source =
    sourceRaw === "runtime" ||
    sourceRaw === "mock" ||
    sourceRaw === "partial" ||
    sourceRaw === "unsupported"
      ? sourceRaw
      : "runtime";

  return {
    summary: {
      runId: str(summaryRaw.runId) || runId,
      label: str(summaryRaw.label) || runId,
      runtimePhase,
      phase3Status,
      subtaskCount:
        typeof summaryRaw.subtaskCount === "number"
          ? summaryRaw.subtaskCount
          : subtasks.length,
      readySubtaskCount,
      blockingCount,
      operationalReadiness,
      updatedAt:
        summaryRaw.updatedAt != null
          ? str(summaryRaw.updatedAt)
          : summaryRaw.updated_at != null
            ? str(summaryRaw.updated_at)
            : null,
      source,
      unsupportedReason:
        summaryRaw.unsupportedReason != null
          ? str(summaryRaw.unsupportedReason)
          : d.unsupportedReason != null
            ? str(d.unsupportedReason)
            : null,
    },
    complexity: mapComplexity(
      (d.complexity as Record<string, unknown>) ?? d.complexityAnalysis,
    ),
    recommendation: mapRecommendation(
      (d.recommendation as Record<string, unknown>) ?? d.aiStrategy,
    ),
    subtasks,
    ordering,
    sharedContext: mapSharedContext(
      (d.sharedContext as Record<string, unknown>) ?? d.sharedRuntimeContext,
    ),
    risks: mapRisks(d.risks),
    decompositionSummary:
      d.decompositionSummary != null
        ? str(d.decompositionSummary)
        : d.decomposition_summary != null
          ? str(d.decomposition_summary)
          : null,
    executableStrategy:
      mapExecutableStrategy(d.executableStrategy ?? d.executable_strategy) ??
      null,
  };
}
