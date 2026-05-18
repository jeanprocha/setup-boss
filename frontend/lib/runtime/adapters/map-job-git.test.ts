import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ApiJobSummary } from "@/lib/api/runtime-types";
import { mapApiJobToRunSummary } from "./map-job.ts";

function baseJob(overrides: Partial<ApiJobSummary> = {}): ApiJobSummary {
  return {
    id: "job-1",
    status: "completed",
    runId: "20260516-200010-test-map-job",
    projectId: "proj-1",
    taskArg: "task.md",
    metadata: { uiPhase: "strategy", uiState: "running" },
    ...overrides,
  };
}

describe("mapApiJobToRunSummary git", () => {
  it("preenche branchHint com activityBranch ready", () => {
    const summary = mapApiJobToRunSummary(
      baseJob({
        branchHint: "setup-boss/20260516-exemplo",
        git: {
          status: "git_branch_ready",
          activityBranch: "setup-boss/20260516-exemplo",
        },
      }),
    );
    assert.equal(summary.branchHint, "setup-boss/20260516-exemplo");
    assert.equal(summary.git?.status, "git_branch_ready");
    assert.equal(summary.git?.activityBranch, "setup-boss/20260516-exemplo");
  });

  it("run antigo sem git mantém branchHint null", () => {
    const summary = mapApiJobToRunSummary(baseJob());
    assert.equal(summary.branchHint, null);
    assert.equal(summary.git, null);
  });

  it("git_branch_failed expõe errorCode seguro", () => {
    const summary = mapApiJobToRunSummary(
      baseJob({
        git: {
          status: "git_branch_failed",
          errorCode: "git_pull_failed",
          errorMessage: "pull falhou",
        },
      }),
    );
    assert.equal(summary.branchHint, null);
    assert.equal(summary.git?.errorCode, "git_pull_failed");
    assert.equal(summary.git?.errorMessage, "pull falhou");
  });
});
