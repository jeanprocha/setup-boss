"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const test = require("node:test").test;

const {
  createInitialLifecycleDocument,
  prepareLifecycleAtRuntimeStart,
  saveExecutionCheckpoint,
  finalizeLifecycleDocument,
  summarizeLifecycleFromEvents,
  readLifecycleDocument,
} = require("./manage-execution-lifecycle");

function tmp(name) {
  return path.join(fs.mkdtempSync(path.join(require("os").tmpdir(), name)));
}

test("lifecycle inicial e prepareLifecycle force", () => {
  const root = tmp("sb-lc1-");
  try {
    const execDir = path.join(root, "execution");
    fs.mkdirSync(execDir, { recursive: true });
    const loaded = { orderDoc: { ordered_subtasks: [] } };
    const events = [];
    const iso = () => "2026-05-14T12:00:00.000Z";
    const r = prepareLifecycleAtRuntimeStart({
      execDir,
      outputDirAbs: root,
      loaded,
      runId: "r1",
      force: true,
      resume: false,
      events,
      iso,
    });
    assert.strictEqual(r.lifecycle.lifecycle_state, "running");
    assert.strictEqual(events.some((e) => e.type === "execution_lifecycle_started"), true);
    const disk = readLifecycleDocument(execDir);
    assert.strictEqual(disk && String(disk.lifecycle_state), "running");
    assert.strictEqual(disk && disk.completed_at, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkpoint e summarizeLifecycleFromEvents", () => {
  const root = tmp("sb-lc2-");
  try {
    const execDir = path.join(root, "execution");
    fs.mkdirSync(path.join(execDir, "subtasks"), { recursive: true });
    const doc = createInitialLifecycleDocument("r2");
    doc.lifecycle_state = "running";
    fs.writeFileSync(path.join(execDir, "execution-lifecycle.json"), JSON.stringify(doc, null, 2));
    const events = [];
    const iso = () => "2026-05-14T12:01:00.000Z";
    saveExecutionCheckpoint({
      execDir,
      outputDirAbs: root,
      loaded: { orderDoc: { ordered_subtasks: [] } },
      subtaskId: "001",
      lifecycleState: "running",
      recoveryState: "unit_test_ck",
      events,
      iso,
    });
    assert.strictEqual(events.some((e) => e.type === "execution_checkpoint_saved"), true);
    const lf = readLifecycleDocument(execDir);
    assert.ok(lf && lf.last_checkpoint && lf.last_checkpoint.subtask_id === "001");
    const s = summarizeLifecycleFromEvents(events);
    assert.strictEqual(s.checkpoints_saved, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resume incrementa recovery.resume_count", () => {
  const root = tmp("sb-lc3-");
  try {
    const execDir = path.join(root, "execution");
    fs.mkdirSync(execDir, { recursive: true });
    const doc = createInitialLifecycleDocument("r3");
    doc.lifecycle_state = "running";
    doc.completed_at = null;
    doc.recovery = { recovered_from_previous_session: false, resume_count: 0, last_resume_at: null };
    fs.writeFileSync(path.join(execDir, "execution-lifecycle.json"), JSON.stringify(doc, null, 2));
    const events = [];
    let t = 0;
    const iso = () => `2026-05-14T12:02:0${t++}.000Z`;
    const loaded = { orderDoc: { ordered_subtasks: [] } };
    prepareLifecycleAtRuntimeStart({
      execDir,
      outputDirAbs: root,
      loaded,
      runId: "r3",
      force: false,
      resume: true,
      events,
      iso,
    });
    const lf = readLifecycleDocument(execDir);
    assert.strictEqual(Number(/** @type {Record<string, unknown>} */ (lf.recovery).resume_count), 1);
    assert.strictEqual(events.some((e) => e.type === "execution_resumed"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("finalizeLifecycleDocument terminal completed", () => {
  const root = tmp("sb-lc4-");
  try {
    const execDir = path.join(root, "execution");
    fs.mkdirSync(execDir, { recursive: true });
    const doc = createInitialLifecycleDocument("r4");
    doc.lifecycle_state = "running";
    fs.writeFileSync(path.join(execDir, "execution-lifecycle.json"), JSON.stringify(doc, null, 2));
    const events = [];
    const iso = () => "2026-05-14T12:03:00.000Z";
    finalizeLifecycleDocument({
      execDir,
      loaded: { orderDoc: { ordered_subtasks: [] } },
      events,
      iso,
      terminal: "completed",
    });
    const lf = readLifecycleDocument(execDir);
    assert.strictEqual(String(lf.lifecycle_state), "completed");
    assert.ok(typeof lf.completed_at === "string" && lf.completed_at.length > 0);
    assert.strictEqual(events.some((e) => e.type === "execution_lifecycle_completed"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
