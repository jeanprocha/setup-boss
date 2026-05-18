import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";
import { mockRuns } from "@/lib/mocks/runs";

function baseBundle(
  runId: string,
  patch: Partial<StrategyBundleDto> & {
    summaryPatch?: Partial<StrategyBundleDto["summary"]>;
  },
): StrategyBundleDto {
  const run = mockRuns.find((r) => r.id === runId);
  const subtasks = patch.subtasks ?? [];
  const readySubtaskCount = subtasks.filter((s) => s.readiness === "ready").length;
  const blockingCount = subtasks.filter((s) => s.readiness === "blocked").length;

  return {
    complexity: {
      level: "medium",
      estimatedDifficulty: "moderate",
      executionRisk: "medium",
      runtimeLoad: "moderate",
      coordinationComplexity: "medium",
      rationale: "Superfície multi-módulo com gates HITL.",
    },
    recommendation: {
      recommendedMode: "standard",
      modelStrategy: "standard · review gate por subtask",
      executionApproach: "Decomposição linear com handoff para execution runtime",
      rationale: "Equilíbrio custo/cobertura para MVP mission control.",
      operationalImpact: "Review obrigatório em subtasks de alto risco.",
      costPerformanceHint: "Tokens moderados; paralelismo limitado a 2.",
    },
    ordering: {
      orderingMode: "linear",
      sequence: [],
      readyIds: [],
      pendingIds: [],
      blockingDependencies: [],
    },
    sharedContext: {
      artifacts: ["strategy/shared-runtime-context.json"],
      constraints: ["no_dag", "runtime_first"],
      rules: ["audit_events_required"],
      crossSubtaskDeps: [],
    },
    risks: [],
    decompositionSummary: null,
    executableStrategy: null,
    ...patch,
    summary: {
      runId,
      label: run?.label ?? runId,
      runtimePhase: "strategy_ready",
      phase3Status: "strategy_ready",
      subtaskCount: subtasks.length,
      readySubtaskCount,
      blockingCount,
      operationalReadiness: "partial",
      updatedAt: new Date().toISOString(),
      source: "mock",
      unsupportedReason: null,
      ...patch.summaryPatch,
    },
    subtasks,
  };
}

const strategyReady: StrategyBundleDto = baseBundle("run-1023", {
  summaryPatch: {
    runtimePhase: "strategy_ready",
    phase3Status: "strategy_ready",
    operationalReadiness: "partial",
    blockingCount: 1,
  },
  complexity: {
    level: "medium",
    estimatedDifficulty: "moderate",
    executionRisk: "medium",
    runtimeLoad: "moderate",
    coordinationComplexity: "medium",
    rationale: "Frontend + daemon; HITL auditável.",
  },
  recommendation: {
    recommendedMode: "standard",
    modelStrategy: "standard · dual-surface",
    executionApproach: "Intake → clarify → strategy → execution sequencial",
    rationale: "Escopo confirmado em clarificação; manter gates.",
    operationalImpact: "Bloqueio até aprovação de plano refinado.",
    costPerformanceHint: "Evitar expert salvo subtasks críticas.",
  },
  decompositionSummary:
    "5 subtasks operacionais: intake, clarify, strategy, executor, review — sem DAG visual.",
  subtasks: [
    {
      id: "001",
      title: "intake-discovery",
      parentId: null,
      order: 1,
      state: "ready",
      dependsOn: [],
      ownership: "runtime-intake",
      readiness: "ready",
      blockerLabel: null,
    },
    {
      id: "002",
      title: "clarify-approval",
      parentId: null,
      order: 2,
      state: "ready",
      dependsOn: ["001"],
      ownership: "hitl-clarify",
      readiness: "ready",
      blockerLabel: null,
    },
    {
      id: "003",
      title: "strategy-decompose",
      parentId: null,
      order: 3,
      state: "planned",
      dependsOn: ["002"],
      ownership: "strategy-runtime",
      readiness: "blocked",
      blockerLabel: "Aguarda aprovação HITL",
    },
    {
      id: "003a",
      title: "complexity-analysis",
      parentId: "003",
      order: 1,
      state: "planned",
      dependsOn: [],
      ownership: "strategy-runtime",
      readiness: "not_ready",
      blockerLabel: null,
    },
    {
      id: "003b",
      title: "execution-ordering",
      parentId: "003",
      order: 2,
      state: "planned",
      dependsOn: ["003a"],
      ownership: "strategy-runtime",
      readiness: "not_ready",
      blockerLabel: null,
    },
    {
      id: "004",
      title: "executor-apply",
      parentId: null,
      order: 4,
      state: "pending",
      dependsOn: ["003"],
      ownership: "execution-runtime",
      readiness: "not_ready",
      blockerLabel: null,
    },
    {
      id: "005",
      title: "review-gate",
      parentId: null,
      order: 5,
      state: "pending",
      dependsOn: ["004"],
      ownership: "review-runtime",
      readiness: "not_ready",
      blockerLabel: null,
    },
  ],
  ordering: {
    orderingMode: "linear",
    sequence: [
      { position: 1, subtaskId: "001", title: "intake-discovery", dependsOn: [], status: "ready" },
      { position: 2, subtaskId: "002", title: "clarify-approval", dependsOn: ["001"], status: "ready" },
      {
        position: 3,
        subtaskId: "003",
        title: "strategy-decompose",
        dependsOn: ["002"],
        status: "blocked",
      },
      { position: 4, subtaskId: "004", title: "executor-apply", dependsOn: ["003"], status: "pending" },
      { position: 5, subtaskId: "005", title: "review-gate", dependsOn: ["004"], status: "pending" },
    ],
    readyIds: ["001", "002"],
    pendingIds: ["004", "005"],
    blockingDependencies: [
      { from: "002", to: "003", label: "002 → 003" },
      { from: "003", to: "004", label: "003 → 004" },
    ],
  },
  sharedContext: {
    artifacts: [
      "strategy/shared-runtime-context.json",
      "strategy/decomposition.json",
    ],
    constraints: ["no_dag", "runtime_first", "hitl_audit"],
    rules: ["approval_before_strategy_execute"],
    crossSubtaskDeps: [
      { subtaskId: "003", refs: ["strategy/ai-strategy.json"] },
      { subtaskId: "004", refs: ["strategy/execution-order.json"] },
    ],
  },
  risks: [
    { id: "r1", label: "Handoff clarify → strategy sem aprovação", level: "high" },
    { id: "r2", label: "Drift entre decomposition e ordering", level: "medium" },
  ],
});

const strategyApproved: StrategyBundleDto = baseBundle("run-1024", {
  summaryPatch: {
    runtimePhase: "ready_for_execution",
    phase3Status: "ready_for_execution",
    operationalReadiness: "ready",
    blockingCount: 0,
  },
  complexity: {
    level: "high",
    estimatedDifficulty: "complex",
    executionRisk: "high",
    runtimeLoad: "heavy",
    coordinationComplexity: "high",
    rationale: "Motor de execução activo com review pendente.",
  },
  recommendation: {
    recommendedMode: "expert",
    modelStrategy: "expert · recovery-aware",
    executionApproach: "Execução com subtask activa + review gate",
    rationale: "Complexidade elevada em runtime activo.",
    operationalImpact: "Priorizar observabilidade e retry policy.",
    costPerformanceHint: "Custo alto justificado por risco de regressão.",
  },
  decompositionSummary: "3 subtasks de execução: session build, executor, review.",
  subtasks: [
    {
      id: "st-build",
      title: "build-execution-session",
      parentId: null,
      order: 1,
      state: "ready",
      dependsOn: [],
      ownership: "execution-runtime",
      readiness: "ready",
      blockerLabel: null,
    },
    {
      id: "st-exec",
      title: "subtask-executor",
      parentId: null,
      order: 2,
      state: "planned",
      dependsOn: ["st-build"],
      ownership: "execution-runtime",
      readiness: "ready",
      blockerLabel: null,
    },
    {
      id: "st-review",
      title: "run-execution-review",
      parentId: null,
      order: 3,
      state: "pending",
      dependsOn: ["st-exec"],
      ownership: "review-runtime",
      readiness: "not_ready",
      blockerLabel: null,
    },
  ],
  ordering: {
    orderingMode: "linear",
    sequence: [
      { position: 1, subtaskId: "st-build", title: "build-execution-session", dependsOn: [], status: "ready" },
      { position: 2, subtaskId: "st-exec", title: "subtask-executor", dependsOn: ["st-build"], status: "ready" },
      { position: 3, subtaskId: "st-review", title: "run-execution-review", dependsOn: ["st-exec"], status: "pending" },
    ],
    readyIds: ["st-build", "st-exec"],
    pendingIds: ["st-review"],
    blockingDependencies: [{ from: "st-exec", to: "st-review", label: "st-exec → st-review" }],
  },
  risks: [{ id: "r1", label: "Review gate bloqueia pipeline", level: "medium" }],
});

const strategyGenerating: StrategyBundleDto = baseBundle("run-1018", {
  summaryPatch: {
    runtimePhase: "strategy_generating",
    phase3Status: "strategy_generating",
    operationalReadiness: "not_ready",
    blockingCount: 2,
  },
  complexity: {
    level: "high",
    estimatedDifficulty: "complex",
    executionRisk: "high",
    runtimeLoad: "heavy",
    coordinationComplexity: "high",
    rationale: "Governança semântica e dependências de fase anterior.",
  },
  recommendation: {
    recommendedMode: "expert",
    modelStrategy: "expert · policy-first",
    executionApproach: "Resolver bloqueios antes de ordering final",
    rationale: "Corrida bloqueada em review/policy.",
    operationalImpact: "Strategy não deve avançar até desbloqueio.",
    costPerformanceHint: null,
  },
  decompositionSummary: "Decomposição parcial — aguarda artefactos phase3.",
  subtasks: [
    {
      id: "p1",
      title: "policy-scan",
      parentId: null,
      order: 1,
      state: "blocked",
      dependsOn: [],
      ownership: "strategy-runtime",
      readiness: "blocked",
      blockerLabel: "Review rejeitado",
    },
    {
      id: "p2",
      title: "re-decompose",
      parentId: null,
      order: 2,
      state: "pending",
      dependsOn: ["p1"],
      ownership: "strategy-runtime",
      readiness: "not_ready",
      blockerLabel: null,
    },
  ],
  ordering: {
    orderingMode: "staged",
    sequence: [
      { position: 1, subtaskId: "p1", title: "policy-scan", dependsOn: [], status: "blocked" },
      { position: 2, subtaskId: "p2", title: "re-decompose", dependsOn: ["p1"], status: "pending" },
    ],
    readyIds: [],
    pendingIds: ["p2"],
    blockingDependencies: [{ from: "p1", to: "p2", label: "p1 → p2" }],
  },
  risks: [
    { id: "r1", label: "Governança semântica", level: "high" },
    { id: "r2", label: "Dependência de fase anterior", level: "medium" },
  ],
});

const strategyBlocked: StrategyBundleDto = baseBundle("run-1022", {
  summaryPatch: {
    runtimePhase: "strategy_blocked",
    phase3Status: "strategy_blocked",
    operationalReadiness: "not_ready",
    blockingCount: 1,
  },
  complexity: {
    level: "medium",
    estimatedDifficulty: "moderate",
    executionRisk: "medium",
    runtimeLoad: "moderate",
    coordinationComplexity: "medium",
    rationale: "Gate HITL de review activo.",
  },
  recommendation: {
    recommendedMode: "basic",
    modelStrategy: "basic · wait-for-human",
    executionApproach: "Pausar strategy até veredito humano",
    rationale: "Não avançar executor sem aprovação.",
    operationalImpact: "Ordering congelado.",
    costPerformanceHint: "Modo económico enquanto aguarda HITL.",
  },
  subtasks: [
    {
      id: "rv1",
      title: "deterministic-review",
      parentId: null,
      order: 1,
      state: "blocked",
      dependsOn: [],
      ownership: "review-runtime",
      readiness: "blocked",
      blockerLabel: "HITL pendente",
    },
    {
      id: "rv2",
      title: "hitl-approval",
      parentId: null,
      order: 2,
      state: "pending",
      dependsOn: ["rv1"],
      ownership: "hitl",
      readiness: "not_ready",
      blockerLabel: null,
    },
  ],
  ordering: {
    orderingMode: "linear",
    sequence: [
      { position: 1, subtaskId: "rv1", title: "deterministic-review", dependsOn: [], status: "blocked" },
      { position: 2, subtaskId: "rv2", title: "hitl-approval", dependsOn: ["rv1"], status: "pending" },
    ],
    readyIds: [],
    pendingIds: ["rv2"],
    blockingDependencies: [{ from: "rv1", to: "rv2", label: "rv1 → rv2" }],
  },
  risks: [{ id: "r1", label: "Rejeição de review bloqueia pipeline", level: "high" }],
});

const BY_RUN: Record<string, StrategyBundleDto> = {
  "run-1023": strategyReady,
  "run-1024": strategyApproved,
  "run-1018": strategyGenerating,
  "run-1022": strategyBlocked,
  "run-1020": strategyApproved,
  "run-1021": strategyApproved,
};

export function getMockStrategyBundle(runId: string): StrategyBundleDto {
  return BY_RUN[runId] ?? strategyReady;
}

export function mockStrategyUnsupported(runId: string): StrategyBundleDto {
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
      unsupportedReason:
        "Sem read-model strategy (API 404 ou corrida fora de escopo phase3).",
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
  };
}
