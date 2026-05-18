import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { translateOperationalPlan } from "./translate-operational-plan.ts";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { StrategyBundleDto } from "../strategy/strategy-types.ts";

function baseClarification(
  overrides: Partial<ClarificationBundleDto> = {},
): ClarificationBundleDto {
  return {
    session: {
      runId: "run-1",
      phase2Status: "plan_refined",
      runtimePhase: "refinement_ready",
      currentRound: 1,
      questionsCount: 1,
      answersCount: 1,
      pendingBlockingCount: 0,
      updatedAt: null,
    },
    questions: [],
    answers: [],
    refinement: {
      available: true,
      refinedTask: "Implementar chat lateral na tela de integrações",
      scopeChanges: ["Apenas visual e botão de abrir/fechar"],
      acceptanceCriteria: ["Botão visível", "Painel abre e fecha"],
      risks: ["Regressão no layout"],
      executionReadiness: "pending_approval",
    },
    approval: { status: "pending", notes: null, decidedAt: null, planRef: null },
    source: "runtime",
    unsupportedReason: null,
    ...overrides,
  };
}

function baseStrategy(): StrategyBundleDto {
  return {
    summary: {
      runId: "run-1",
      label: "run-1",
      runtimePhase: "strategy_ready",
      phase3Status: "strategy_ready",
      subtaskCount: 2,
      readySubtaskCount: 2,
      blockingCount: 0,
      operationalReadiness: "ready",
      updatedAt: null,
      source: "runtime",
      unsupportedReason: null,
    },
    complexity: {
      level: "medium",
      estimatedDifficulty: "moderate",
      executionRisk: "medium",
      runtimeLoad: "moderate",
      coordinationComplexity: "low",
      rationale: "UI isolada com baixo acoplamento.",
    },
    recommendation: {
      recommendedMode: "standard",
      modelStrategy: "hidden",
      executionApproach: "Implementação incremental por componente.",
      rationale: "hidden",
      operationalImpact: "Validar em viewport estreita.",
      costPerformanceHint: null,
    },
    subtasks: [
      {
        id: "st-1",
        title: "Criar componente de chat",
        parentId: null,
        order: 1,
        state: "ready",
        dependsOn: [],
        ownership: null,
        readiness: "ready",
        blockerLabel: null,
      },
    ],
    ordering: {
      orderingMode: "linear",
      sequence: [
        {
          position: 1,
          subtaskId: "st-1",
          title: "Criar componente de chat",
          dependsOn: [],
          status: "ready",
        },
      ],
      readyIds: ["st-1"],
      pendingIds: [],
      blockingDependencies: [],
    },
    sharedContext: { artifacts: [], constraints: ["Sem alterar API"], rules: [], crossSubtaskDeps: [] },
    risks: [{ id: "r1", label: "Conflito CSS", level: "low" }],
    decompositionSummary: "Duas entregas visuais sequenciais.",
    executableStrategy: null,
  };
}

describe("translateOperationalPlan", () => {
  it("traduz refinement + strategy sem termos técnicos no modelo", () => {
    const plan = translateOperationalPlan({
      clarification: baseClarification(),
      strategy: baseStrategy(),
    });
    assert.ok(plan.hasContent);
    assert.match(
      plan.understanding.summary ?? plan.understanding.mainObjective ?? "",
      /chat/i,
    );
    assert.ok(plan.whatWillBeDone.length > 0);
    assert.equal(plan.complexity?.levelLabelPt, "Média");
    assert.ok(plan.complexity?.explanation?.includes("acoplamento"));
    assert.equal(plan.executionRecommendation?.levelLabelPt, "Padrão");
    assert.equal(plan.executionRecommendation?.recommendedLevel, "normal");
    assert.ok(plan.risks.length >= 2);
    assert.equal(plan.miniTasks.mode, "direct");
    assert.ok(
      plan.executionStrategy.approach?.includes("incremental") ||
        plan.understanding.summary?.includes("chat"),
    );
    assert.ok(plan.completionCriteria.length >= 2);
  });

  it("refinement isolado ainda produz plano parcial", () => {
    const plan = translateOperationalPlan({
      clarification: baseClarification(),
    });
    assert.ok(plan.hasContent);
    assert.equal(plan.complexity.levelLabelPt, "Média");
    assert.ok(plan.complexity.explanation);
    assert.equal(plan.executionRecommendation.levelLabelPt, "Padrão");
    assert.ok(plan.executionRecommendation.explanation);
    assert.equal(plan.miniTasks.mode, "direct");
    assert.ok(plan.risks.length >= 1);
  });

  it("divide mini-tarefas quando há duas ou mais", () => {
    const strategy = baseStrategy();
    strategy.subtasks.push({
      id: "st-2",
      title: "Integrar na tela de integrações",
      parentId: null,
      order: 2,
      state: "ready",
      dependsOn: ["st-1"],
      ownership: null,
      readiness: "ready",
      blockerLabel: null,
    });
    const plan = translateOperationalPlan({
      clarification: baseClarification(),
      strategy,
    });
    assert.equal(plan.miniTasks.mode, "divided");
    assert.equal(plan.miniTasks.tasks.length, 2);
  });

  it("inclui executableStrategyView quando OES está disponível", () => {
    const strategy = baseStrategy();
    strategy.executableStrategy = {
      available: true,
      degraded: false,
      version: 1,
      planVersion: "v1",
      sourcePlanVersion: "v1",
      strategySha256: null,
      orderingMode: "linear",
      executionPattern: "sequential_by_step",
      macroOrder: ["mini-001-a", "mini-002-b"],
      dependencies: [],
      validationApproach: "per_mini_task",
      expectedImpact: {
        affectedFiles: ["src/App.tsx"],
        affectedComponents: [],
        affectedModules: [],
        structuralRisk: "low",
        visualRisk: "low",
        behaviorRisk: "low",
        summary: null,
      },
      miniTasks: [
        {
          id: "mini-001-a",
          subtaskId: null,
          order: 1,
          title: "Primeira entrega",
          objective: "Objetivo da primeira entrega.",
          scope: { summary: "Escopo A", highlights: [] },
          affectedFiles: [],
          affectedDomains: [],
          dependsOnIds: [],
          complexity: "low",
          risk: "low",
          acceptanceCriteria: ["critério A"],
          completionCriteria: [],
          validationHints: [],
        },
        {
          id: "mini-002-b",
          subtaskId: null,
          order: 2,
          title: "Segunda entrega",
          objective: "Objetivo da segunda.",
          scope: { summary: null, highlights: [] },
          affectedFiles: [],
          affectedDomains: [],
          dependsOnIds: ["mini-001-a"],
          complexity: "medium",
          risk: "medium",
          acceptanceCriteria: [],
          completionCriteria: [],
          validationHints: [],
        },
      ],
      approvalState: { approved: false, strategySha256: null },
    };
    const plan = translateOperationalPlan({
      clarification: baseClarification(),
      strategy,
    });
    assert.ok(plan.executableStrategyView);
    assert.equal(plan.executableStrategyView?.mode, "full");
    assert.equal(plan.executableStrategyView?.miniTasks.length, 2);
  });
});
