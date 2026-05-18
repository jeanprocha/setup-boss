import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  approvalOperationalStatusRail,
  deriveOperationalApprovalActions,
  shouldShowApprovalPhasePanel,
} from "./approval-operational-state.ts";
import type { RunOperationalUxContract } from "./operational-ux-types.ts";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";

function baseContract(
  overrides: Partial<RunOperationalUxContract> = {},
): RunOperationalUxContract {
  return {
    uxPhase: "approval",
    uxStep: "plan_approval_gate",
    uxPhaseLabelPt: "Aprovação",
    uxStepLabelPt: "Rever e aprovar plano",
    iaValidated: true,
    contextLoaded: true,
    initialSpecReady: true,
    planningStatus: "plan_ready_for_review",
    planningQuestionsPending: 0,
    finalPlanReady: true,
    requiresHumanAction: true,
    isInitializationPhase: false,
    isPlanningPhase: false,
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
      refinedTask: "Plano operacional",
      scopeChanges: [],
      acceptanceCriteria: ["OK"],
      risks: [],
      executionReadiness: "pending_approval",
    },
    approval: { status: "pending", notes: null, decidedAt: null, planRef: "plan.md" },
    source: "runtime",
    unsupportedReason: null,
    ...overrides,
  };
}

describe("shouldShowApprovalPhasePanel", () => {
  it("uxPhase approval + plano pendente → true", () => {
    assert.equal(
      shouldShowApprovalPhasePanel({
        executionApplies: false,
        isInitializationPhase: false,
        operationalUx: baseContract(),
        bundle: baseBundle(),
      }),
      true,
    );
  });

  it("aprovado → false", () => {
    assert.equal(
      shouldShowApprovalPhasePanel({
        executionApplies: false,
        isInitializationPhase: false,
        operationalUx: baseContract({ uxPhase: "planning" }),
        bundle: baseBundle({
          approval: { status: "approved", notes: null, decidedAt: null, planRef: "p" },
          session: { ...baseBundle().session, runtimePhase: "approved" },
        }),
      }),
      false,
    );
  });

  it("execução activa → false", () => {
    assert.equal(
      shouldShowApprovalPhasePanel({
        executionApplies: true,
        isInitializationPhase: false,
        operationalUx: baseContract(),
        bundle: baseBundle(),
      }),
      false,
    );
  });
});

describe("approvalOperationalStatusRail", () => {
  it("decisão pendente → só awaiting_decision", () => {
    assert.deepEqual(approvalOperationalStatusRail("awaiting_decision"), [
      "awaiting_decision",
    ]);
  });

  it("a voltar ao planejamento → dois passos", () => {
    assert.deepEqual(approvalOperationalStatusRail("returning_to_planning"), [
      "awaiting_decision",
      "returning_to_planning",
    ]);
  });

  it("aprovado → rail completo", () => {
    assert.deepEqual(approvalOperationalStatusRail("approved"), [
      "awaiting_decision",
      "approved",
    ]);
  });
});

describe("deriveOperationalApprovalActions", () => {
  it("refinement_ready permite aprovar e voltar ao planejamento", () => {
    const a = deriveOperationalApprovalActions(
      baseBundle(),
      baseContract(),
    );
    assert.equal(a.canApprove, true);
    assert.equal(a.canReturnToPlanning, true);
    assert.equal(a.canAddPlanComment, true);
  });

  it("perguntas pendentes bloqueiam aprovação", () => {
    const a = deriveOperationalApprovalActions(
      baseBundle({
        session: { ...baseBundle().session, pendingBlockingCount: 2 },
      }),
      baseContract(),
    );
    assert.equal(a.canApprove, false);
    assert.ok(a.blockedReason?.includes("perguntas"));
  });
});
