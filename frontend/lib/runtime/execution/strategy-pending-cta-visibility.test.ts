import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";
import { deriveMissionWorkspaceStatuses } from "@/lib/runtime/mission/mission-workflow-stages";
import { strategyAutoStartInProgress } from "@/lib/runtime/strategy/strategy-auto-start-policy";
import { strategyAwaitingUserKickoff } from "@/lib/runtime/strategy/strategy-operational-state";
import { buildExecutionTimelineCards } from "@/lib/runtime/execution/build-execution-timeline-cards";
import {
  buildSemanticExecutionTimeline,
  semanticTimelineAnchorId,
} from "@/lib/runtime/execution/semantic-workflow-mapper";
import {
  EXECUTION_STEPS,
  type ExecutionStepDefinition,
} from "@/lib/runtime/execution/execution-step-catalog";
import type { OperationalPipelineRow } from "@/lib/runtime/execution/derive-operational-pipeline";
import { operationalToSurfaceStatus } from "@/lib/runtime/execution/execution-timeline-card-types";

function mockClarification(
  runtimePhase: ClarificationBundleDto["session"]["runtimePhase"],
): ClarificationBundleDto {
  return {
    session: {
      runId: "run-1",
      runtimePhase,
      phase2Status: "ready_for_execution",
      questionsCount: 1,
      answersCount: 1,
      updatedAt: null,
    },
    questions: [],
    answers: [],
    refinement: {
      available: true,
      refinedTask: "task",
      executionReadiness: "ready",
    },
    approval: { status: "approved", notes: null, decidedAt: null },
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
      executionApproach: "Abordagem pendente",
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

function pipelineRow(
  id: ExecutionStepDefinition["id"],
  timelinePhase: OperationalPipelineRow["timelinePhase"],
  status: OperationalPipelineRow["status"] = "pending",
): OperationalPipelineRow {
  const definition = EXECUTION_STEPS.find((s) => s.id === id)!;
  return {
    definition,
    status,
    timelinePhase,
    scrollTargetId: `exec-card-${id}`,
  };
}

const summary: RunSummaryDto = {
  id: "job-1",
  runId: "run-1",
  projectId: "proj-1",
  phase: "clarification",
  state: "running",
  jobStatus: "running",
  label: "Test",
  startedAtLabel: null,
  branchHint: null,
};

describe("strategy auto-start UX", () => {
  it("strategyAwaitingUserKickoff falso em strategy_pending pós-approve", () => {
    const clarification = mockClarification("ready_for_execution");
    const strategy = mockStrategy("strategy_pending");
    assert.equal(strategyAutoStartInProgress(clarification, strategy), true);
    assert.equal(strategyAwaitingUserKickoff(clarification, strategy), false);
  });

  it("card strategy_generated: Gerando, sem Iniciar estratégia", () => {
    const clarification = mockClarification("ready_for_execution");
    const strategy = mockStrategy("strategy_pending");
    const row = pipelineRow("strategy_generated", "future");
    const cards = buildExecutionTimelineCards({
      rows: [row],
      runId: "run-1",
      projectId: "proj-1",
      projectLabel: null,
      newActivityFlow: false,
      summary,
      events: [],
      operational: null,
      clarificationApplies: true,
      strategyApplies: true,
      executionApplies: false,
      clarificationBundle: clarification,
      strategyBundle: strategy,
      executionBundle: null,
      attentionHint: null,
      operationalHeadline: null,
      dominantStrategyHandoff: true,
    });
    assert.match(cards[0]!.summaryLine, /gerar estratégia/i);
    assert.equal(
      cards[0]!.actions.some((a) => a.label === "Iniciar estratégia"),
      false,
    );
    assert.equal(cards[0]!.highlights.some((h) => h.value === "A gerar"), true);
  });

  it("retry manual só em strategy_failed", () => {
    const clarification = mockClarification("ready_for_execution");
    const strategy = mockStrategy("strategy_failed");
    const row = pipelineRow("strategy_generated", "current");
    const cards = buildExecutionTimelineCards({
      rows: [row],
      runId: "run-1",
      projectId: "proj-1",
      projectLabel: null,
      newActivityFlow: false,
      summary,
      events: [],
      operational: null,
      clarificationApplies: true,
      strategyApplies: true,
      executionApplies: false,
      clarificationBundle: clarification,
      strategyBundle: strategy,
      executionBundle: null,
      attentionHint: null,
      operationalHeadline: null,
      dominantStrategyHandoff: true,
    });
    assert.equal(
      cards[0]!.actions.some((a) => a.label === "Tentar gerar estratégia novamente"),
      true,
    );
  });

  it("semantic strategy: running, sem CTA navigate", () => {
    const clarification = mockClarification("ready_for_execution");
    const strategy = mockStrategy("strategy_pending");
    const row = pipelineRow("strategy_generated", "future");
    const atomic = buildExecutionTimelineCards({
      rows: [row],
      runId: "run-1",
      projectId: "proj-1",
      projectLabel: null,
      newActivityFlow: false,
      summary,
      events: [],
      operational: null,
      clarificationApplies: true,
      strategyApplies: true,
      executionApplies: false,
      clarificationBundle: clarification,
      strategyBundle: strategy,
      executionBundle: null,
      attentionHint: null,
      operationalHeadline: null,
      dominantStrategyHandoff: true,
    });
    const semantic = buildSemanticExecutionTimeline({
      cards: atomic,
      rows: [row],
      summary,
      clarificationBundle: clarification,
      strategyBundle: strategy,
      strategyPhase: "strategy_pending",
      dominantStrategyHandoff: true,
      executionPhase: null,
    });
    assert.equal(semantic[0]!.status, "running");
    assert.equal(semantic[0]!.surfaceStatus, "active");
    assert.equal(
      semantic[0]!.actions.some(
        (a) => a.intent === "navigate" && a.navigation?.target === "strategy",
      ),
      false,
    );
  });

  it("deriveMissionWorkspaceStatuses: strategy RUNNING pós-approve", () => {
    const clarification = mockClarification("ready_for_execution");
    const strategy = mockStrategy("strategy_pending");
    const statuses = deriveMissionWorkspaceStatuses(summary, {
      clarification: { applies: true, bundle: clarification },
      strategy: { applies: true, bundle: strategy },
      execution: { applies: false, lifecyclePhase: null },
    });
    assert.equal(statuses.strategy, "RUNNING");
  });

  it("surface active em running (não pending)", () => {
    const clarification = mockClarification("strategy_pending");
    const strategy = mockStrategy("strategy_pending");
    const row = pipelineRow("strategy_generated", "future", "pending");
    const atomic = buildExecutionTimelineCards({
      rows: [row],
      runId: "run-1",
      projectId: "proj-1",
      projectLabel: null,
      newActivityFlow: false,
      summary,
      events: [],
      operational: null,
      clarificationApplies: true,
      strategyApplies: true,
      executionApplies: false,
      clarificationBundle: clarification,
      strategyBundle: strategy,
      executionBundle: null,
      attentionHint: null,
      operationalHeadline: null,
      dominantStrategyHandoff: true,
    });
    const semantic = buildSemanticExecutionTimeline({
      cards: atomic,
      rows: [row],
      summary,
      clarificationBundle: clarification,
      strategyBundle: strategy,
      strategyPhase: "strategy_pending",
      dominantStrategyHandoff: true,
      executionPhase: null,
    });
    assert.equal(semantic[0]!.status, "running");
    assert.equal(operationalToSurfaceStatus("running"), "active");
    assert.equal(semantic[0]!.surfaceStatus, "active");
    assert.equal(semantic[0]!.anchorId, semanticTimelineAnchorId("strategy"));
  });
});
