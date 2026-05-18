import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";
import {
  shouldAutoStartStrategyAfterApproval,
  strategyAutoStartInProgress,
  strategyNeedsManualRetry,
} from "@/lib/runtime/strategy/strategy-auto-start-policy";
import { strategyAwaitingUserKickoff } from "@/lib/runtime/strategy/strategy-operational-state";

function mockClarification(
  runtimePhase: ClarificationBundleDto["session"]["runtimePhase"],
  approval: ClarificationBundleDto["approval"]["status"] = "approved",
): ClarificationBundleDto {
  return {
    session: {
      runId: "run-1",
      runtimePhase,
      phase2Status: "ready_for_execution",
      questionsCount: 0,
      answersCount: 0,
      updatedAt: null,
    },
    questions: [],
    answers: [],
    refinement: {
      available: true,
      refinedTask: "task",
      executionReadiness: "ready",
    },
    approval: { status: approval, notes: null, decidedAt: null },
    source: "runtime",
    unsupportedReason: null,
  };
}

function mockStrategy(
  runtimePhase: StrategyBundleDto["summary"]["runtimePhase"],
): StrategyBundleDto {
  return {
    summary: {
      runId: "run-1",
      label: "Strategy",
      runtimePhase,
      phase3Status: runtimePhase,
      subtaskCount: 0,
      readySubtaskCount: 0,
      blockingCount: 0,
      operationalReadiness: "not_ready",
      updatedAt: null,
      source: "runtime",
      unsupportedReason: null,
    },
    complexity: {
      level: "low",
      estimatedDifficulty: "low",
      executionRisk: "low",
      runtimeLoad: "light",
      coordinationComplexity: "low",
      rationale: null,
    },
    recommendation: {
      recommendedMode: "standard",
      modelStrategy: "default",
      executionApproach: "x",
      rationale: "",
      operationalImpact: "",
      costPerformanceHint: null,
    },
    ordering: {
      orderingMode: "linear",
      sequence: [],
      readyIds: [],
      pendingIds: [],
      blockingDependencies: [],
    },
    sharedContext: { artifacts: [], notes: [] },
    risks: [],
    decompositionSummary: null,
  };
}

describe("strategy auto-start policy", () => {
  it("shouldAutoStartStrategyAfterApproval em fases pós-approve", () => {
    assert.equal(shouldAutoStartStrategyAfterApproval("strategy_pending", null), true);
    assert.equal(
      shouldAutoStartStrategyAfterApproval("ready_for_execution", "ready_for_execution"),
      true,
    );
    assert.equal(shouldAutoStartStrategyAfterApproval("waiting_answers", null), false);
  });

  it("strategyAutoStartInProgress sem handoff manual", () => {
    const c = mockClarification("ready_for_execution");
    const s = mockStrategy("strategy_pending");
    assert.equal(strategyAutoStartInProgress(c, s), true);
    assert.equal(strategyAwaitingUserKickoff(c, s), false);
  });

  it("strategyAutoStartInProgress false quando strategy_ready", () => {
    const c = mockClarification("strategy_pending");
    const s = mockStrategy("strategy_ready");
    s.summary.operationalReadiness = "ready";
    assert.equal(strategyAutoStartInProgress(c, s), false);
  });

  it("strategyNeedsManualRetry só em failed", () => {
    const c = mockClarification("ready_for_execution");
    const s = mockStrategy("strategy_failed");
    assert.equal(strategyNeedsManualRetry(s), true);
    assert.equal(strategyAwaitingUserKickoff(c, s), true);
    assert.equal(strategyAutoStartInProgress(c, s), false);
  });
});
