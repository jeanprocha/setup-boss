import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCentralShellView } from "./central-shell-view.ts";

describe("resolveCentralShellView", () => {
  it("prioriza project run quando selectedRunId existe", () => {
    assert.equal(
      resolveCentralShellView({
        selectedRunId: "20260101-run",
        selectedWorkspaceRunId: "wsrun_abc",
      }),
      "project-run",
    );
  });

  it("mostra workspace só sem selectedRunId", () => {
    assert.equal(
      resolveCentralShellView({
        selectedRunId: null,
        selectedWorkspaceRunId: "wsrun_abc",
      }),
      "workspace-run",
    );
  });

  it("mostra workspace quando só selectedWorkspaceId", () => {
    assert.equal(
      resolveCentralShellView({
        selectedRunId: null,
        selectedWorkspaceRunId: null,
        selectedWorkspaceId: "ws_chat",
      }),
      "workspace-run",
    );
  });

  it("default project-run sem seleção", () => {
    assert.equal(
      resolveCentralShellView({
        selectedRunId: null,
        selectedWorkspaceRunId: null,
        selectedWorkspaceId: null,
      }),
      "project-run",
    );
  });
});
