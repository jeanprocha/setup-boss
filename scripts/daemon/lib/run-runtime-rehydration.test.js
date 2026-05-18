"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  classifyRunRecovery,
  ACTIVE_ORCH_STATES,
} = require("./run-runtime-rehydration");

test("classifyRunRecovery detecta orphan orchestration sem job", () => {
  const r = classifyRunRecovery({
    runId: "run-1",
    orchState: "execution_running",
    job: null,
    bundle: {
      summary: {
        lifecycle: { phase: "execution_completed" },
        correction: { status: "idle", generation: 0 },
        retry: { active: false },
        review: { status: "none" },
      },
      subtasks: [],
    },
  });
  assert.strictEqual(r.status, "orphaned");
  assert.ok(r.reasons.some((x) => x.includes("terminal")));
});

test("classifyRunRecovery detecta stale sem worker", () => {
  const r = classifyRunRecovery({
    runId: "run-2",
    orchState: "execution_running",
    job: null,
    bundle: {
      summary: {
        lifecycle: { phase: "execution_running" },
        correction: { status: "idle", generation: 0 },
        retry: { active: false },
        review: { status: "none" },
      },
      subtasks: [],
    },
  });
  assert.strictEqual(r.status, "stale");
});

test("classifyRunRecovery marca recovered com job activo", () => {
  const r = classifyRunRecovery({
    runId: "run-3",
    orchState: "execution_running",
    job: { status: "running", recovery_reason: null },
    bundle: {
      summary: {
        lifecycle: { phase: "execution_running" },
        correction: { status: "idle", generation: 0 },
        retry: { active: false },
        review: { status: "none" },
      },
      subtasks: [{ state: "running" }],
    },
  });
  assert.strictEqual(r.status, "recovered");
  assert.ok(ACTIVE_ORCH_STATES.has("execution_running"));
});
