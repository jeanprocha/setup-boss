import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOperationalExecuteReadyDespiteStaleJobPhase,
  shouldBlockExecutionNotApplicable,
} from "./operational-execute-readiness.ts";

const clarReady = {
  approval: { status: "approved" },
  session: {
    runtimePhase: "ready_for_execution",
    phase2Status: "ready_for_execution",
  },
} as never;

describe("operational execute readiness", () => {
  it("libera gate de fase com clarify + git_branch_ready + aprovado", () => {
    assert.equal(
      shouldBlockExecutionNotApplicable({
        phaseRaw: "clarify",
        clarification: clarReady,
        git: {
          status: "git_branch_ready",
          activityBranch: "setup-boss/test",
        },
      }),
      false,
    );
  });

  it("bloqueia clarify sem versionamento", () => {
    assert.equal(
      shouldBlockExecutionNotApplicable({
        phaseRaw: "clarify",
        clarification: clarReady,
        git: { status: "git_branch_pending" },
      }),
      true,
    );
  });

  it("não aplica em fase strategy", () => {
    assert.equal(
      shouldBlockExecutionNotApplicable({
        phaseRaw: "strategy",
        clarification: clarReady,
        git: { status: "git_branch_ready" },
      }),
      false,
    );
  });

  it("isOperationalExecuteReady exige git_branch_ready", () => {
    assert.equal(
      isOperationalExecuteReadyDespiteStaleJobPhase({
        clarification: clarReady,
        git: null,
      }),
      false,
    );
  });
});
