import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeMissionShellCrossSelection } from "./mission-shell-selection-sanitize.ts";

describe("sanitizeMissionShellCrossSelection", () => {
  it("prioriza run de projeto quando workspaceRun também está setado", () => {
    const r = sanitizeMissionShellCrossSelection({
      selectedProjectId: "proj_a",
      selectedRunId: "run_1",
      selectedWorkspaceId: "ws_1",
      selectedWorkspaceRunId: "wsrun_1",
    });
    assert.equal(r.changed, true);
    assert.equal(r.value.selectedProjectId, "proj_a");
    assert.equal(r.value.selectedRunId, "run_1");
    assert.equal(r.value.selectedWorkspaceRunId, null);
    assert.equal(r.value.selectedWorkspaceId, null);
  });

  it("limpa workspaceRun stale quando projeto está selecionado sem run", () => {
    const r = sanitizeMissionShellCrossSelection({
      selectedProjectId: "proj_a",
      selectedRunId: null,
      selectedWorkspaceId: "ws_1",
      selectedWorkspaceRunId: "wsrun_stale",
    });
    assert.equal(r.changed, true);
    assert.equal(r.value.selectedWorkspaceRunId, null);
    assert.equal(r.value.selectedWorkspaceId, null);
    assert.equal(r.value.selectedProjectId, "proj_a");
  });

  it("mantém seleção só de workspace", () => {
    const r = sanitizeMissionShellCrossSelection({
      selectedProjectId: null,
      selectedRunId: null,
      selectedWorkspaceId: "ws_1",
      selectedWorkspaceRunId: "wsrun_1",
    });
    assert.equal(r.changed, false);
    assert.equal(r.value.selectedWorkspaceRunId, "wsrun_1");
  });
});
