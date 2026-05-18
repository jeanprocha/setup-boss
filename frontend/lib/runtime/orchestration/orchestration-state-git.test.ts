import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveExecuteAvailability } from "./orchestration-state.ts";

describe("deriveExecuteAvailability git", () => {
  const base = {
    runKey: "20260516-200020-test",
    reachable: true,
    clarification: null,
    strategy: null,
    bootstrap: null,
    jobStatus: "completed",
    phaseRaw: "strategy",
  };

  it("propaga git_branch_required via executeBlockCode", () => {
    const a = deriveExecuteAvailability({
      ...base,
      git: { executeBlockCode: "git_branch_required" },
    });
    assert.equal(a.canExecute, false);
    assert.equal(a.reason, "git_branch_required");
    assert.match(a.message ?? "", /Prepare a branch/i);
  });

  it("não confunde com clarification_pending", () => {
    const a = deriveExecuteAvailability({
      ...base,
      git: { executeBlockCode: "git_branch_required" },
      clarification: {
        approval: { status: "pending" },
        session: { runtimePhase: "awaiting_approval", phase2Status: "plan_refined" },
      } as never,
    });
    assert.equal(a.reason, "clarification_pending");
  });

  it("git_branch_failed sem executeBlockCode usa mensagem do git", () => {
    const a = deriveExecuteAvailability({
      ...base,
      git: {
        status: "git_branch_failed",
        errorCode: "git_pull_failed",
        errorMessage: "Pull rejeitado.",
      },
    });
    assert.equal(a.canExecute, false);
    assert.equal(a.reason, "git_branch_required");
    assert.equal(a.message, "Pull rejeitado.");
  });
});
