import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  projectsByIdMap,
  resolveProjectsForWorkspace,
} from "./partition-projects-by-workspace.ts";

describe("resolveProjectsForWorkspace", () => {
  it("resolve projectIds na ordem do workspace", () => {
    const projectsById = projectsByIdMap([
      { id: "api", displayName: "API" },
      { id: "front", displayName: "Front" },
    ] as never[]);

    const resolved = resolveProjectsForWorkspace(
      {
        workspaceId: "ws1",
        name: "wiser",
        projectIds: ["front", "api", "missing"],
        primaryProjectId: null,
        createdAt: "",
        updatedAt: "",
      },
      projectsById,
    );

    assert.equal(resolved.length, 2);
    assert.equal(resolved[0]?.id, "front");
    assert.equal(resolved[1]?.id, "api");
  });
});
