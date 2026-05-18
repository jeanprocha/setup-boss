import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ExecuteAvailability } from "@/lib/runtime/orchestration/orchestration-types";
import { shouldShowGitBranchPrepareCta } from "./git-branch-cta-visibility.ts";

const summaryBase: RunSummaryDto = {
  id: "job-1",
  runId: "run-1",
  projectId: "p1",
  label: "Test",
  phase: "strategy",
  state: "running",
  startedAtLabel: null,
  branchHint: null,
};

function availability(
  reason: ExecuteAvailability["reason"],
): ExecuteAvailability {
  return {
    canExecute: false,
    reason,
    message: reason ?? null,
    degraded: false,
  };
}

describe("shouldShowGitBranchPrepareCta", () => {
  it("mostra CTA quando reason é git_branch_required", () => {
    assert.equal(
      shouldShowGitBranchPrepareCta(availability("git_branch_required"), summaryBase),
      true,
    );
  });

  it("não mostra para clarification_pending", () => {
    assert.equal(
      shouldShowGitBranchPrepareCta(availability("clarification_pending"), summaryBase),
      false,
    );
  });

  it("não mostra para strategy_not_ready", () => {
    assert.equal(
      shouldShowGitBranchPrepareCta(availability("strategy_not_ready"), summaryBase),
      false,
    );
  });

  it("git_branch_ready remove CTA", () => {
    assert.equal(
      shouldShowGitBranchPrepareCta(availability("git_branch_required"), {
        ...summaryBase,
        git: { status: "git_branch_ready", activityBranch: "setup-boss/x" },
        branchHint: "setup-boss/x",
      }),
      false,
    );
  });
});
