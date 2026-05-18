import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunSummaryDto, RuntimeEventDto } from "../../api/runtime-types.ts";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { StrategyBundleDto } from "../strategy/strategy-types.ts";
import {
  deriveOperationalUxContract,
  mapRuntimeEventTypeToOperationalUx,
} from "./derive-operational-ux-contract.ts";

function summary(partial: Partial<RunSummaryDto> & { phase: string }): RunSummaryDto {
  return {
    id: "job-1",
    runId: "run-1",
    projectId: "proj-1",
    label: "Test",
    phase: partial.phase,
    state: partial.state ?? "running",
    startedAtLabel: null,
    branchHint: null,
    ...partial,
  };
}

function ev(type: string): RuntimeEventDto {
  return {
    id: `e-${type}`,
    tsIso: new Date().toISOString(),
    ts: "12:00",
    channel: "runtime",
    message: type,
    severity: "info",
    type,
    jobId: "job-1",
    runId: "run-1",
    phaseHint: null,
  };
}

function clarBundle(
  runtimePhase: ClarificationBundleDto["session"]["runtimePhase"],
  overrides: Partial<ClarificationBundleDto> = {},
): ClarificationBundleDto {
  return {
    session: {
      runId: "run-1",
      phase2Status: "questions_generated",
      runtimePhase,
      currentRound: 1,
      questionsCount: 1,
      answersCount: 0,
      pendingBlockingCount: 1,
      updatedAt: null,
    },
    questions: [
      {
        id: "q1",
        prompt: "Qual o escopo?",
        kind: "free_text",
        blocking: true,
        options: [],
        status: "pending",
        answer: null,
      },
    ],
    answers: [],
    refinement: {
      available: false,
      refinedTask: null,
      scopeChanges: [],
      acceptanceCriteria: [],
      risks: [],
      executionReadiness: "not_ready",
    },
    approval: { status: "none", notes: null, decidedAt: null, planRef: null },
    source: "runtime",
    unsupportedReason: null,
    ...overrides,
  };
}

describe("deriveOperationalUxContract", () => {
  it("nova atividade sem run → Inicialização", () => {
    const c = deriveOperationalUxContract({
      summary: null,
      newActivityFlow: true,
      governanceReadiness: "ready",
    });
    assert.equal(c.uxPhase, "initialization");
    assert.equal(c.isInitializationPhase, true);
    assert.equal(c.iaValidated, true);
  });

  it("intake + evento bootstrap → contextLoaded e milestones", () => {
    const c = deriveOperationalUxContract({
      summary: summary({ phase: "intake" }),
      events: [ev("knowledge_bootstrap_ready")],
      governanceReadiness: "ready",
    });
    assert.equal(c.uxPhase, "initialization");
    assert.equal(c.contextLoaded, true);
    assert.equal(c.iaValidated, true);
  });

  it("intake_completed → initialSpecReady", () => {
    const c = deriveOperationalUxContract({
      summary: summary({ phase: "intake" }),
      events: [ev("intake_completed")],
    });
    assert.equal(c.initialSpecReady, true);
  });

  it("clarification waiting_answers → Montando o plano + perguntas pendentes", () => {
    const bundle = clarBundle("waiting_answers");
    const c = deriveOperationalUxContract({
      summary: summary({ phase: "clarification" }),
      clarificationApplies: true,
      clarificationBundle: bundle,
    });
    assert.equal(c.uxPhase, "planning");
    assert.equal(c.isPlanningPhase, true);
    assert.equal(c.planningQuestionsPending, 1);
    assert.equal(c.planningStatus, "questions_pending");
    assert.equal(c.requiresHumanAction, true);
  });

  it("refinement_ready com gate → Aprovação", () => {
    const bundle = clarBundle("refinement_ready", {
      refinement: {
        available: true,
        refinedTask: "Plano X",
        scopeChanges: [],
        acceptanceCriteria: ["Critério"],
        risks: [],
        executionReadiness: "pending_approval",
      },
      approval: { status: "pending", notes: null, decidedAt: null, planRef: "plan.md" },
    });
    const c = deriveOperationalUxContract({
      summary: summary({ phase: "clarification" }),
      clarificationApplies: true,
      clarificationBundle: bundle,
    });
    assert.equal(c.uxPhase, "approval");
    assert.equal(c.finalPlanReady, true);
  });

  it("strategy_generating pós-approve → Montando o plano (strategy_building)", () => {
    const bundle = clarBundle("strategy_pending", {
      approval: { status: "approved", notes: null, decidedAt: null, planRef: "p" },
      questions: [],
    });
    const strategy: StrategyBundleDto = {
      summary: {
        runId: "run-1",
        label: "S",
        runtimePhase: "strategy_generating",
        phase3Status: null,
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
        executionApproach: "linear",
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
      sharedContext: { artifacts: [], constraints: [], rules: [], crossSubtaskDeps: [] },
      risks: [],
      decompositionSummary: null,
      executableStrategy: null,
    };
    const c = deriveOperationalUxContract({
      summary: summary({ phase: "strategy" }),
      clarificationApplies: true,
      clarificationBundle: bundle,
      strategyApplies: true,
      strategyBundle: strategy,
    });
    assert.equal(c.uxPhase, "planning");
    assert.equal(c.planningStatus, "strategy_building");
  });

  it("mapRuntimeEventTypeToOperationalUx: clarification → planning", () => {
    assert.equal(
      mapRuntimeEventTypeToOperationalUx("clarification_questions_generated"),
      "planning",
    );
    assert.equal(mapRuntimeEventTypeToOperationalUx("strategy_started"), "planning");
    assert.equal(
      mapRuntimeEventTypeToOperationalUx("clarification_approve"),
      "approval",
    );
  });
});
