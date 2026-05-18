"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  emitWorkspaceRunSse,
  notifyWorkspaceRunSse,
  subscribeWorkspaceRunSseListener,
  WORKSPACE_RUN_SSE_EVENT_TYPES,
} = require("./workspace-run-sse");

test("WORKSPACE_RUN_SSE_EVENT_TYPES contém eventos mínimos", () => {
  for (const t of [
    "workspace_run.updated",
    "workspace_run.started",
    "workspace_run.advanced",
    "workspace_run.git_updated",
  ]) {
    assert.ok(WORKSPACE_RUN_SSE_EVENT_TYPES.has(t), t);
  }
});

test("emitWorkspaceRunSse notifica listeners", () => {
  const seen = [];
  const unsub = subscribeWorkspaceRunSseListener((p) => seen.push(p));
  emitWorkspaceRunSse("workspace_run.updated", {
    workspaceRunId: "wsrun_test",
    workspaceId: "ws_test",
    status: "running",
    timestamp: new Date().toISOString(),
  });
  unsub();
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].eventType, "workspace_run.updated");
  assert.strictEqual(seen[0].workspaceRunId, "wsrun_test");
});

test("notifyWorkspaceRunSse tolera run inexistente", () => {
  const seen = [];
  const unsub = subscribeWorkspaceRunSseListener((p) => seen.push(p));
  notifyWorkspaceRunSse("workspace_run.error", "wsrun_missing_xyz", {
    message: "not_found",
  });
  unsub();
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].workspaceRunId, "wsrun_missing_xyz");
});
