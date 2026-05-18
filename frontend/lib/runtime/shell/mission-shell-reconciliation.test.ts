import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  reconcileMissionShellSelection,
  shellReconcileSignature,
} from "./mission-shell-reconciliation.ts";

const projA = { id: "proj_a", displayName: "A", subtitle: "", lastSeenAt: "" };
const run1 = {
  id: "job_1",
  runId: "20260101-run",
  projectId: "proj_a",
  label: "run",
  phase: "clarify",
  state: "running" as const,
  startedAtLabel: null,
  branchHint: null,
  jobStatus: "completed",
};

describe("reconcileMissionShellSelection", () => {
  it("não altera nada enquanto projects não estão prontos", () => {
    const r = reconcileMissionShellSelection({
      selectedProjectId: "proj_stale",
      selectedRunId: "run_x",
      expandedProjectIds: ["proj_stale"],
      projects: [],
      runs: [],
      projectsReady: false,
      runsReady: false,
    });
    assert.equal(r.changed, false);
    assert.equal(r.selectedProjectId, "proj_stale");
    assert.equal(r.notice, null);
  });

  it("limpa projectId órfão e run associada", () => {
    const r = reconcileMissionShellSelection({
      selectedProjectId: "proj_stale",
      selectedRunId: "run_x",
      expandedProjectIds: ["proj_stale", "proj_a"],
      projects: [projA],
      runs: [],
      projectsReady: true,
      runsReady: false,
    });
    assert.equal(r.changed, true);
    assert.equal(r.selectedProjectId, null);
    assert.equal(r.selectedRunId, null);
    assert.equal(r.notice, "project_unavailable");
    assert.deepEqual(r.expandedProjectIds, ["proj_a"]);
  });

  it("limpa runId órfão mantendo projeto válido", () => {
    const r = reconcileMissionShellSelection({
      selectedProjectId: "proj_a",
      selectedRunId: "orphan_run",
      expandedProjectIds: ["proj_a"],
      projects: [projA],
      runs: [run1],
      projectsReady: true,
      runsReady: true,
    });
    assert.equal(r.changed, true);
    assert.equal(r.selectedProjectId, "proj_a");
    assert.equal(r.selectedRunId, null);
    assert.equal(r.notice, "run_unavailable");
  });

  it("mantém seleção válida", () => {
    const r = reconcileMissionShellSelection({
      selectedProjectId: "proj_a",
      selectedRunId: "20260101-run",
      expandedProjectIds: ["proj_a"],
      projects: [projA],
      runs: [run1],
      projectsReady: true,
      runsReady: true,
    });
    assert.equal(r.changed, false);
    assert.equal(r.selectedProjectId, "proj_a");
    assert.equal(r.selectedRunId, "20260101-run");
    assert.equal(r.notice, null);
  });
});

describe("shellReconcileSignature", () => {
  it("muda quando lista de projetos muda", () => {
    const a = shellReconcileSignature({
      projectsReady: true,
      runsReady: false,
      projectIds: ["proj_a"],
      runKeys: [],
      selectedProjectId: "proj_a",
      selectedRunId: null,
      expandedProjectIds: [],
    });
    const b = shellReconcileSignature({
      projectsReady: true,
      runsReady: false,
      projectIds: ["proj_a", "proj_b"],
      runKeys: [],
      selectedProjectId: "proj_a",
      selectedRunId: null,
      expandedProjectIds: [],
    });
    assert.notEqual(a, b);
  });
});
