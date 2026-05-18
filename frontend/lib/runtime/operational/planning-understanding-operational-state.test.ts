import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  derivePlanningUnderstandingStatus,
  shouldShowPlanningUnderstandingPanel,
} from "./planning-understanding-operational-state.ts";
import type { RunOperationalUxContract } from "./operational-ux-types.ts";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";

function baseContract(
  overrides: Partial<RunOperationalUxContract> = {},
): RunOperationalUxContract {
  return {
    uxPhase: "planning",
    uxStep: "planning_questions",
    uxPhaseLabelPt: "Montando o plano",
    uxStepLabelPt: "Perguntas de entendimento",
    iaValidated: true,
    contextLoaded: true,
    initialSpecReady: true,
    planningStatus: "questions_pending",
    planningQuestionsPending: 1,
    finalPlanReady: false,
    requiresHumanAction: true,
    isInitializationPhase: false,
    isPlanningPhase: true,
    confidence: "high",
    ...overrides,
  };
}

function baseBundle(
  overrides: Partial<ClarificationBundleDto> = {},
): ClarificationBundleDto {
  return {
    session: {
      runId: "run-1",
      phase2Status: "waiting_answers",
      runtimePhase: "waiting_answers",
      currentRound: 1,
      questionsCount: 1,
      answersCount: 0,
      pendingBlockingCount: 1,
      updatedAt: null,
    },
    questions: [
      {
        id: "q1",
        prompt: "Qual o critério de aceite?",
        kind: "free_text",
        blocking: true,
        options: [],
        status: "pending",
        answer: null,
      },
    ],
    answers: [],
    refinement: { available: false, refinedTask: null, scopeChanges: [], acceptanceCriteria: [], risks: [], executionReadiness: "not_ready" },
    approval: { status: "none", notes: null, decidedAt: null, planRef: null },
    source: "runtime",
    unsupportedReason: null,
    ...overrides,
  };
}

describe("derivePlanningUnderstandingStatus", () => {
  it("perguntas pendentes → awaiting_answers", () => {
    const s = derivePlanningUnderstandingStatus({
      contract: baseContract(),
      bundle: baseBundle(),
    });
    assert.equal(s, "awaiting_answers");
  });

  it("refining → processing_answers", () => {
    const s = derivePlanningUnderstandingStatus({
      contract: baseContract(),
      bundle: baseBundle({
        session: {
          ...baseBundle().session,
          runtimePhase: "refining",
        },
      }),
      submitPending: true,
    });
    assert.equal(s, "processing_answers");
  });

  it("refinement disponível → understanding_complete", () => {
    const s = derivePlanningUnderstandingStatus({
      contract: baseContract({ planningStatus: "plan_ready_for_review" }),
      bundle: baseBundle({
        refinement: {
          ...baseBundle().refinement,
          available: true,
          refinedTask: "tarefa",
        },
        session: {
          ...baseBundle().session,
          runtimePhase: "refinement_ready",
        },
      }),
    });
    assert.equal(s, "understanding_complete");
  });

  it("rodada > 1 sem perguntas a gerar → generating_new_questions", () => {
    const s = derivePlanningUnderstandingStatus({
      contract: baseContract(),
      bundle: baseBundle({
        questions: [],
        session: {
          ...baseBundle().session,
          currentRound: 2,
          runtimePhase: "clarification_empty",
        },
      }),
      clarificationFetching: true,
    });
    assert.equal(s, "generating_new_questions");
  });
});

describe("shouldShowPlanningUnderstandingPanel", () => {
  it("clarification activa → true", () => {
    assert.equal(
      shouldShowPlanningUnderstandingPanel({
        executionApplies: false,
        isInitializationPhase: false,
        clarificationApplies: true,
        bundle: baseBundle(),
      }),
      true,
    );
  });

  it("aprovado → false", () => {
    assert.equal(
      shouldShowPlanningUnderstandingPanel({
        executionApplies: false,
        isInitializationPhase: false,
        clarificationApplies: true,
        bundle: baseBundle({
          approval: { status: "approved", notes: null, decidedAt: null, planRef: null },
          session: { ...baseBundle().session, runtimePhase: "approved" },
        }),
      }),
      false,
    );
  });

  it("refinement disponível → false (painel do plano operacional Fase 4)", () => {
    assert.equal(
      shouldShowPlanningUnderstandingPanel({
        executionApplies: false,
        isInitializationPhase: false,
        clarificationApplies: true,
        bundle: baseBundle({
          refinement: {
            ...baseBundle().refinement,
            available: true,
            refinedTask: "tarefa",
          },
          session: { ...baseBundle().session, runtimePhase: "refinement_ready" },
        }),
      }),
      false,
    );
  });
});
