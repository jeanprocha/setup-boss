import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveExecutionOperationalStatus,
  deriveExecutionOperationalSteps,
  isVersioningOperationallyComplete,
  labelExecutionLifecycleForUser,
  labelSubtaskStateForUser,
  shouldShowExecutionPhasePanel,
} from "./execution-operational-state.ts";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { RunSummaryDto } from "../../api/runtime-types.ts";

function approvedBundle(): ClarificationBundleDto {
  return {
    session: {
      runId: "run-1",
      phase2Status: "ready_for_execution",
      runtimePhase: "approved",
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
      refinedTask: "tarefa",
      scopeChanges: [],
      acceptanceCriteria: [],
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
    label: "Criar chat",
    phase: "strategy",
    state: "success",
    startedAtLabel: null,
    branchHint: null,
    git: { status: "git_branch_ready", activityBranch: "setup-boss/x" },
    ...overrides,
  };
}

describe("isVersioningOperationallyComplete", () => {
  it("git_branch_ready → true", () => {
    assert.equal(isVersioningOperationallyComplete(baseSummary()), true);
  });

  it("sem git → false", () => {
    assert.equal(isVersioningOperationallyComplete(baseSummary({ git: undefined })), false);
  });
});

describe("shouldShowExecutionPhasePanel", () => {
  it("aprovado + branch pronta → true", () => {
    assert.equal(
      shouldShowExecutionPhasePanel({
        isInitializationPhase: false,
        bundle: approvedBundle(),
        summary: baseSummary(),
        executionLifecyclePhase: "execution_pending",
      }),
      true,
    );
  });

  it("execução concluída sem ajuste → false (Review assume)", () => {
    assert.equal(
      shouldShowExecutionPhasePanel({
        isInitializationPhase: false,
        bundle: approvedBundle(),
        summary: baseSummary(),
        executionLifecyclePhase: "execution_completed",
      }),
      false,
    );
  });

  it("branch não pronta → false", () => {
    assert.equal(
      shouldShowExecutionPhasePanel({
        isInitializationPhase: false,
        bundle: approvedBundle(),
        summary: baseSummary({
          git: { status: "git_branch_pending", activityBranch: "x" },
        }),
        executionLifecyclePhase: null,
      }),
      false,
    );
  });

  it("inicialização → false", () => {
    assert.equal(
      shouldShowExecutionPhasePanel({
        isInitializationPhase: true,
        bundle: approvedBundle(),
        summary: baseSummary(),
        executionLifecyclePhase: null,
      }),
      false,
    );
  });
});

describe("deriveExecutionOperationalStatus", () => {
  it("pending → awaiting_start", () => {
    assert.equal(
      deriveExecutionOperationalStatus({
        lifecyclePhase: "execution_pending",
        orchestrationState: "ready_for_execution",
        executePending: false,
      }),
      "awaiting_start",
    );
  });

  it("correction → adjusting", () => {
    assert.equal(
      deriveExecutionOperationalStatus({
        lifecyclePhase: "correction_running",
        orchestrationState: "execution_correcting",
        executePending: false,
      }),
      "adjusting",
    );
  });

  it("completed → completed", () => {
    assert.equal(
      deriveExecutionOperationalStatus({
        lifecyclePhase: "execution_completed",
        orchestrationState: "execution_completed",
        executePending: false,
      }),
      "completed",
    );
  });
});

describe("labelExecutionLifecycleForUser", () => {
  it("não expõe correction", () => {
    const label = labelExecutionLifecycleForUser("correction_running");
    assert.equal(label, "Ajustando automaticamente");
    assert.ok(!label.toLowerCase().includes("correction"));
  });
});

describe("labelSubtaskStateForUser", () => {
  it("reviewing → Validando", () => {
    assert.equal(labelSubtaskStateForUser("reviewing"), "Validando");
  });
});

describe("deriveExecutionOperationalSteps", () => {
  it("awaiting_start activa primeiro passo", () => {
    const steps = deriveExecutionOperationalSteps({
      status: "awaiting_start",
      lifecyclePhase: "execution_pending",
      hasSubtasks: false,
    });
    assert.equal(steps[0]?.state, "active");
    assert.equal(steps[1]?.state, "pending");
  });

  it("completed marca todos done", () => {
    const steps = deriveExecutionOperationalSteps({
      status: "completed",
      lifecyclePhase: "execution_completed",
      hasSubtasks: true,
    });
    assert.ok(steps.every((s) => s.state === "done"));
  });
});
