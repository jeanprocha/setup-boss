import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { RunSummaryDto } from "../../api/runtime-types.ts";
import {
  executionAutoStartInProgress,
  shouldAutoStartExecutionAfterVersioning,
} from "./execution-auto-start-policy.ts";

function summary(
  gitStatus: string,
  overrides: Partial<RunSummaryDto> = {},
): RunSummaryDto {
  return {
    id: "job-1",
    runId: "run-1",
    projectId: "p1",
    label: "t",
    phase: "strategy",
    state: "success",
    startedAtLabel: null,
    branchHint: null,
    git: { status: gitStatus, activityBranch: "setup-boss/x" },
    ...overrides,
  };
}

describe("shouldAutoStartExecutionAfterVersioning", () => {
  it("git_branch_ready + execution_pending → true", () => {
    assert.equal(
      shouldAutoStartExecutionAfterVersioning(
        summary("git_branch_ready"),
        "execution_pending",
        "ready_for_execution",
      ),
      true,
    );
  });

  it("branch não pronta → false", () => {
    assert.equal(
      shouldAutoStartExecutionAfterVersioning(
        summary("git_branch_pending"),
        "execution_pending",
        "ready_for_execution",
      ),
      false,
    );
  });

  it("execução já em curso → false", () => {
    assert.equal(
      shouldAutoStartExecutionAfterVersioning(
        summary("git_branch_ready"),
        "execution_running",
        "execution_running",
      ),
      false,
    );
  });

  it("job running → false", () => {
    assert.equal(
      shouldAutoStartExecutionAfterVersioning(
        summary("git_branch_ready"),
        "execution_pending",
        "ready_for_execution",
        "running",
      ),
      false,
    );
  });
});

describe("executionAutoStartInProgress", () => {
  it("true enquanto mutate pendente", () => {
    assert.equal(
      executionAutoStartInProgress(
        summary("git_branch_ready"),
        "execution_pending",
        "ready_for_execution",
        { executePending: true, canExecute: true },
      ),
      true,
    );
  });

  it("false quando canExecute é false (sem spinner falso)", () => {
    assert.equal(
      executionAutoStartInProgress(
        summary("git_branch_ready", {
          git: {
            status: "git_branch_ready",
            activityBranch: "setup-boss/x",
            executeBlockCode: "git_branch_mismatch",
          },
        }),
        "execution_pending",
        "ready_for_execution",
        { canExecute: false },
      ),
      false,
    );
  });

  it("false após falha de auto-start", () => {
    assert.equal(
      executionAutoStartInProgress(
        summary("git_branch_ready"),
        "execution_pending",
        "ready_for_execution",
        { autoStartFailed: true },
      ),
      false,
    );
  });
});
