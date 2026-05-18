import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canFetchProjectGovernance,
  isProjectInRegistry,
  isProjectNotFoundMessage,
} from "./project-registry-validation.ts";

describe("project-registry-validation", () => {
  it("detects project in registry", () => {
    assert.equal(
      isProjectInRegistry("proj_a", [{ id: "proj_a" } as { id: string }]),
      true,
    );
    assert.equal(
      isProjectInRegistry("proj_stale", [{ id: "proj_a" } as { id: string }]),
      false,
    );
  });

  it("bloqueia governance para projectId stale", () => {
    assert.equal(
      canFetchProjectGovernance("proj_stale", [{ id: "proj_a" } as { id: string }], {
        reachable: true,
        projectsReady: true,
      }),
      false,
    );
    assert.equal(
      canFetchProjectGovernance("proj_a", [{ id: "proj_a" } as { id: string }], {
        reachable: true,
        projectsReady: true,
      }),
      true,
    );
    assert.equal(
      canFetchProjectGovernance("proj_a", [{ id: "proj_a" } as { id: string }], {
        reachable: true,
        projectsReady: false,
      }),
      false,
    );
  });

  it("detects not-found API messages", () => {
    assert.equal(
      isProjectNotFoundMessage("Projeto não encontrado: proj_x"),
      true,
    );
    assert.equal(isProjectNotFoundMessage("Project not found: proj_x"), true);
    assert.equal(isProjectNotFoundMessage("Timeout"), false);
  });
});
