import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isExecutionOperationallyComplete,
  shouldShowReviewPhasePanel,
} from "./review-operational-state.ts";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { RunSummaryDto } from "../../api/runtime-types.ts";

function approvedBundle(): ClarificationBundleDto {
  return {
    session: {
      runId: "run-1",
      phase2Status: "ready_for_execution",
      runtimePhase: "approved",
      currentRound: 1,
      questionsCount: 0,
      answersCount: 0,
      pendingBlockingCount: 0,
      updatedAt: null,
    },
    questions: [],
    answers: [],
    refinement: {
      available: true,
      refinedTask: "tarefa",
      scopeChanges: [],
      acceptanceCriteria: ["Botão visível"],
      risks: [],
      executionReadiness: "ready",
    },
    approval: { status: "approved", notes: null, decidedAt: null, planRef: "p" },
    source: "runtime",
    unsupportedReason: null,
  };
}

function baseSummary(overrides: Partial<RunSummaryDto> = {}): RunSummaryDto {
  return {
    id: "job-1",
    runId: "run-1",
    projectId: "proj-a",
    label: "Chat lateral",
    phase: "execution",
    state: "success",
    startedAtLabel: null,
    branchHint: null,
    ...overrides,
  };
}

describe("shouldShowReviewPhasePanel", () => {
  it("execução concluída → true", () => {
    assert.equal(
      shouldShowReviewPhasePanel({
        isInitializationPhase: false,
        bundle: approvedBundle(),
        summary: baseSummary(),
        executionLifecyclePhase: "execution_completed",
        hitl: {
          status: "pending",
          operatorNotes: "",
          createdAt: null,
          confirmedAt: null,
          adjustmentRequestedAt: null,
        },
      }),
      true,
    );
  });

  it("review confirmado → false", () => {
    assert.equal(
      shouldShowReviewPhasePanel({
        isInitializationPhase: false,
        bundle: approvedBundle(),
        summary: baseSummary(),
        executionLifecyclePhase: "execution_completed",
        hitl: {
          status: "confirmed",
          operatorNotes: "",
          createdAt: null,
          confirmedAt: "2026-05-17",
          adjustmentRequestedAt: null,
        },
      }),
      false,
    );
  });

  it("execução em curso → false", () => {
    assert.equal(
      shouldShowReviewPhasePanel({
        isInitializationPhase: false,
        bundle: approvedBundle(),
        summary: baseSummary({ state: "running" }),
        executionLifecyclePhase: "execution_running",
        hitl: null,
      }),
      false,
    );
  });
});

describe("isExecutionOperationallyComplete", () => {
  it("lifecycle completed", () => {
    assert.equal(
      isExecutionOperationallyComplete("execution_completed", baseSummary()),
      true,
    );
  });
});
