import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  derivePlanningOperationalPlanStatus,
  shouldShowPlanningOperationalPlanPanel,
} from "./planning-operational-plan-state.ts";
import type { RunOperationalUxContract } from "./operational-ux-types.ts";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { StrategyBundleDto } from "../strategy/strategy-types.ts";

function baseContract(): RunOperationalUxContract {
  return {
    uxPhase: "planning",
    uxStep: "planning_strategy",
    uxPhaseLabelPt: "Montando o plano",
    uxStepLabelPt: "Plano operacional",
    iaValidated: true,
    contextLoaded: true,
    initialSpecReady: true,
    planningStatus: "plan_ready_for_review",
    planningQuestionsPending: 0,
    finalPlanReady: false,
    requiresHumanAction: false,
    isInitializationPhase: false,
    isPlanningPhase: true,
    confidence: "high",
  };
}

function baseBundle(
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
      refinedTask: "Tarefa refinada",
      scopeChanges: [],
      acceptanceCriteria: ["Critério A"],
      risks: [],
      executionReadiness: "pending_approval",
    },
    approval: { status: "pending", notes: null, decidedAt: null, planRef: null },
    source: "runtime",
    unsupportedReason: null,
    ...overrides,
  };
}

describe("derivePlanningOperationalPlanStatus", () => {
  it("refining → generating_plan", () => {
    const s = derivePlanningOperationalPlanStatus({
      contract: baseContract(),
      clarification: baseBundle({
        session: { ...baseBundle().session, runtimePhase: "refining" },
        refinement: { ...baseBundle().refinement, available: false },
      }),
    });
    assert.equal(s, "generating_plan");
  });

  it("refinement + strategy ready → plan_final_generated", () => {
    const strategy: StrategyBundleDto = {
      summary: {
        runId: "run-1",
        label: "run-1",
        runtimePhase: "strategy_ready",
        phase3Status: "strategy_ready",
        subtaskCount: 1,
        readySubtaskCount: 1,
        blockingCount: 0,
        operationalReadiness: "ready",
        updatedAt: null,
        source: "runtime",
        unsupportedReason: null,
      },
      complexity: {
        level: "low",
        estimatedDifficulty: "easy",
        executionRisk: "low",
        runtimeLoad: "light",
        coordinationComplexity: "low",
        rationale: null,
      },
      recommendation: {
        recommendedMode: "basic",
        modelStrategy: "",
        executionApproach: "",
        rationale: "",
        operationalImpact: "",
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
    const s = derivePlanningOperationalPlanStatus({
      contract: baseContract(),
      clarification: baseBundle(),
      strategy,
      strategyApplies: true,
    });
    assert.equal(s, "plan_final_generated");
  });
});

describe("shouldShowPlanningOperationalPlanPanel", () => {
  it("refinement disponível → true", () => {
    assert.equal(
      shouldShowPlanningOperationalPlanPanel({
        executionApplies: false,
        isInitializationPhase: false,
        clarificationApplies: true,
        bundle: baseBundle(),
      }),
      true,
    );
  });

  it("perguntas pendentes → false", () => {
    assert.equal(
      shouldShowPlanningOperationalPlanPanel({
        executionApplies: false,
        isInitializationPhase: false,
        clarificationApplies: true,
        bundle: baseBundle({
          session: {
            ...baseBundle().session,
            runtimePhase: "waiting_answers",
            pendingBlockingCount: 1,
          },
          questions: [
            {
              id: "q1",
              prompt: "Pergunta?",
              kind: "free_text",
              blocking: true,
              options: [],
              status: "pending",
              answer: null,
            },
          ],
          refinement: { ...baseBundle().refinement, available: false },
        }),
      }),
      false,
    );
  });
});
