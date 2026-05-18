import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldShowFinalizationPhasePanel,
} from "./finalization-operational-state.ts";
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
    branchHint: "feature/chat",
    git: { status: "git_branch_ready", activityBranch: "feature/chat" },
    ...overrides,
  };
}

describe("shouldShowFinalizationPhasePanel", () => {
  it("review confirmado → true", () => {
    assert.equal(
      shouldShowFinalizationPhasePanel({
        isInitializationPhase: false,
        bundle: approvedBundle(),
        summary: baseSummary(),
        executionLifecyclePhase: "execution_completed",
        reviewHitl: {
          status: "confirmed",
          operatorNotes: "",
          createdAt: null,
          confirmedAt: "2026-05-17",
          adjustmentRequestedAt: null,
        },
        finalizationHitl: {
          status: "pending",
          operatorNotes: "",
          createdAt: null,
          finalizedAt: null,
          adjustmentRequestedAt: null,
        },
      }),
      true,
    );
  });

  it("review pendente → false", () => {
    assert.equal(
      shouldShowFinalizationPhasePanel({
        isInitializationPhase: false,
        bundle: approvedBundle(),
        summary: baseSummary(),
        executionLifecyclePhase: "execution_completed",
        reviewHitl: {
          status: "pending",
          operatorNotes: "",
          createdAt: null,
          confirmedAt: null,
          adjustmentRequestedAt: null,
        },
        finalizationHitl: null,
      }),
      false,
    );
  });

  it("atividade finalizada → true (estado concluído)", () => {
    assert.equal(
      shouldShowFinalizationPhasePanel({
        isInitializationPhase: false,
        bundle: approvedBundle(),
        summary: baseSummary(),
        executionLifecyclePhase: "execution_completed",
        reviewHitl: {
          status: "confirmed",
          operatorNotes: "",
          createdAt: null,
          confirmedAt: "2026-05-17",
          adjustmentRequestedAt: null,
        },
        finalizationHitl: {
          status: "finalized",
          operatorNotes: "",
          createdAt: null,
          finalizedAt: "2026-05-17",
          adjustmentRequestedAt: null,
        },
      }),
      true,
    );
  });

  it("ajuste final solicitado → false (volta ao Review)", () => {
    assert.equal(
      shouldShowFinalizationPhasePanel({
        isInitializationPhase: false,
        bundle: approvedBundle(),
        summary: baseSummary(),
        executionLifecyclePhase: "execution_completed",
        reviewHitl: {
          status: "pending",
          operatorNotes: "ajuste",
          createdAt: null,
          confirmedAt: null,
          adjustmentRequestedAt: null,
        },
        finalizationHitl: {
          status: "adjustment_requested",
          operatorNotes: "ajuste",
          createdAt: null,
          finalizedAt: null,
          adjustmentRequestedAt: "2026-05-17",
        },
      }),
      false,
    );
  });
});
