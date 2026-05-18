"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { collectExecutionBundle } = require("./run-execution");

test("collectExecutionBundle sem artifacts → unsupported sem crash", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ex-"));
  const runId = "20260515-140000-test-execution-empty";
  const outDir = path.join(root, "out", runId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "run-context.json"),
    JSON.stringify({ version: "1.0.0", run_type: "intake" }),
    "utf-8",
  );

  const r = collectExecutionBundle(outDir, runId);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.source, "unsupported");
  assert.strictEqual(r.data.summary.runId, runId);
  assert.deepStrictEqual(r.data.subtasks, []);
  assert.strictEqual(r.data.summary.health, "unavailable");
});

test("collectExecutionBundle com lifecycle → runtime parcial", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ex-"));
  const runId = "20260515-140100-test-execution-partial";
  const outDir = path.join(root, "out", runId);
  const execDir = path.join(outDir, "execution");
  fs.mkdirSync(execDir, { recursive: true });
  fs.writeFileSync(
    path.join(execDir, "execution-lifecycle.json"),
    JSON.stringify({
      version: 1,
      lifecycle_state: "running",
      started_at: "2026-05-15T14:01:00Z",
      updated_at: "2026-05-15T14:02:00Z",
      last_checkpoint: { subtask_id: "001", state: "executing", timestamp: null },
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(outDir, "run-context.json"),
    JSON.stringify({ version: "1.0.0", phase4: { status: "execution_active" } }),
    "utf-8",
  );

  const r = collectExecutionBundle(outDir, runId);
  assert.strictEqual(r.ok, true);
  assert.ok(r.data.source === "partial" || r.data.source === "runtime");
  assert.strictEqual(r.data.summary.lifecycle.phase, "execution_running");
  assert.strictEqual(r.data.summary.lifecycle.currentSubtaskId, "001");
});
