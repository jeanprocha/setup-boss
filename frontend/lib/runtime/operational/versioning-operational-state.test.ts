import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVersioningOperationalContext,
  deriveSuggestedBranchName,
  deriveVersioningOperationalStatus,
  isRunApprovedForVersioning,
  shouldShowVersioningPhasePanel,
} from "./versioning-operational-state.ts";
import type { RunOperationalUxContract } from "./operational-ux-types.ts";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { RunSummaryDto } from "../../api/runtime-types.ts";

function baseContract(
  overrides: Partial<RunOperationalUxContract> = {},
): RunOperationalUxContract {
  return {
    uxPhase: "versioning",
    uxStep: "versioning_branch",
    uxPhaseLabelPt: "Versionamento",
    uxStepLabelPt: "Preparar branch",
    iaValidated: true,
    contextLoaded: true,
    initialSpecReady: true,
    planningStatus: "complete",
    planningQuestionsPending: 0,
    finalPlanReady: true,
    requiresHumanAction: false,
    isInitializationPhase: false,
    isPlanningPhase: false,
    confidence: "high",
    ...overrides,
  };
}

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
    label: "Criar chat lateral",
    phase: "clarification",
    state: "success",
    startedAtLabel: null,
    branchHint: null,
    ...overrides,
  };
}

describe("shouldShowVersioningPhasePanel", () => {
  it("aprovado → true", () => {
    assert.equal(
      shouldShowVersioningPhasePanel({
        executionApplies: false,
        isInitializationPhase: false,
        operationalUx: baseContract(),
        bundle: approvedBundle(),
        summary: baseSummary(),
      }),
      true,
    );
  });

  it("sem aprovação → false", () => {
    assert.equal(
      shouldShowVersioningPhasePanel({
        executionApplies: false,
        isInitializationPhase: false,
        operationalUx: baseContract({ uxPhase: "approval" }),
        bundle: {
          ...approvedBundle(),
          approval: { status: "pending", notes: null, decidedAt: null, planRef: null },
        },
        summary: baseSummary(),
      }),
      false,
    );
  });

  it("execução activa → false", () => {
    assert.equal(
      shouldShowVersioningPhasePanel({
        executionApplies: true,
        isInitializationPhase: false,
        operationalUx: baseContract(),
        bundle: approvedBundle(),
        summary: baseSummary(),
      }),
      false,
    );
  });

  it("git_branch_ready → false (transição para Execução)", () => {
    assert.equal(
      shouldShowVersioningPhasePanel({
        executionApplies: false,
        isInitializationPhase: false,
        operationalUx: baseContract(),
        bundle: approvedBundle(),
        summary: baseSummary({
          git: { status: "git_branch_ready", activityBranch: "setup-boss/x" },
        }),
      }),
      false,
    );
  });
});

describe("deriveSuggestedBranchName", () => {
  it("gera slug a partir do título", () => {
    const name = deriveSuggestedBranchName(
      baseSummary({ label: "Criar Chat Lateral" }),
    );
    assert.match(name, /^setup-boss\/\d{8}-criar-chat-lateral$/);
  });
});

describe("buildVersioningOperationalContext", () => {
  it("modo run com um projeto", () => {
    const ctx = buildVersioningOperationalContext({
      summary: baseSummary({ projectId: "proj-a" }),
      projectsCatalog: [
        {
          id: "proj-a",
          displayName: "App Principal",
          projectRootLabel: "app",
          jobCounts: {},
          lastSeenAt: null,
        },
      ],
    });
    assert.equal(ctx.mode, "run");
    assert.equal(ctx.projects.length, 1);
    assert.equal(ctx.projects[0]?.displayName, "App Principal");
  });
});

describe("deriveVersioningOperationalStatus", () => {
  it("git_branch_ready → workspace_ready", () => {
    const summary = baseSummary({
      git: { status: "git_branch_ready", activityBranch: "setup-boss/x" },
    });
    const ctx = buildVersioningOperationalContext({
      summary,
      projectsCatalog: [],
    });
    assert.equal(
      deriveVersioningOperationalStatus({
        context: ctx,
        summary,
        preparePending: false,
      }),
      "workspace_ready",
    );
  });
});

describe("isRunApprovedForVersioning", () => {
  it("approval approved", () => {
    assert.equal(isRunApprovedForVersioning(approvedBundle()), true);
  });
});
