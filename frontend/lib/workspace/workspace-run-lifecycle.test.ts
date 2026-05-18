import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkspaceRunDto } from "../api/workspace-run-types.ts";
import {
  isWorkspaceRunOperationalPhase,
  resolveWorkspacePlanningSelection,
} from "./workspace-run-lifecycle.ts";

function baseRun(
  partial: Partial<WorkspaceRunDto> = {},
): WorkspaceRunDto {
  return {
    workspaceRunId: "wsrun_test",
    workspaceId: "ws_a",
    title: "T",
    description: null,
    status: "draft",
    globalSpec: null,
    globalPlan: null,
    miniActivities: [],
    childRunIds: [],
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("workspace-run-lifecycle", () => {
  it("operacional só com miniActivities", () => {
    assert.equal(isWorkspaceRunOperationalPhase({ miniActivities: [] }), false);
    assert.equal(
      isWorkspaceRunOperationalPhase({
        miniActivities: [
          {
            miniActivityId: "ma_1",
            order: 0,
            title: "A",
            targetProjectId: "p1",
            status: "pending",
            runId: null,
            dependsOnMiniActivityIds: [],
          },
        ],
      }),
      true,
    );
  });

  it("resolve planningRunId do globalSpec", () => {
    const run = baseRun({
      globalSpec: {
        schemaVersion: 1,
        task: "Export PDF",
        projectIds: ["front", "api"],
        planningRunId: "20260518-run",
        planningProjectId: "front",
      },
    });
    assert.deepEqual(resolveWorkspacePlanningSelection(run), {
      projectId: "front",
      runId: "20260518-run",
    });
  });

  it("sem minis: não é fase operacional", () => {
    const run = baseRun({
      globalSpec: {
        schemaVersion: 1,
        task: "X",
        projectIds: ["p1"],
        planningRunId: "run_1",
        planningProjectId: "p1",
      },
    });
    assert.equal(isWorkspaceRunOperationalPhase(run), false);
    assert.ok(resolveWorkspacePlanningSelection(run));
  });
});
