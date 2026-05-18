import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatExecutionAutoStartBlockMessage } from "./execution-auto-start-block-message.ts";

describe("formatExecutionAutoStartBlockMessage", () => {
  it("git_branch_mismatch inclui branches esperada e actual", () => {
    const view = formatExecutionAutoStartBlockMessage({
      availability: {
        canExecute: false,
        reason: "git_branch_mismatch",
        message: "A branch actual não coincide com a branch preparada para esta atividade.",
        degraded: false,
      },
      git: {
        status: "git_branch_ready",
        activityBranch: "setup-boss/20260517-esperada",
        currentBranch: "setup-boss/20260517-actual",
        executeBlockCode: "git_branch_mismatch",
      },
    });
    assert.ok(view);
    assert.match(view!.body, /outra branch/i);
    assert.match(view!.body, /setup-boss\/20260517-esperada/);
    assert.match(view!.body, /setup-boss\/20260517-actual/);
    assert.doesNotMatch(view!.body, /git_branch_mismatch/);
  });

  it("canExecute true → null", () => {
    assert.equal(
      formatExecutionAutoStartBlockMessage({
        availability: {
          canExecute: true,
          reason: null,
          message: null,
          degraded: false,
        },
        git: null,
      }),
      null,
    );
  });
});
