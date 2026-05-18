"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  lifecycleToOrchestrationStates,
  snapshotFromBundle,
  diffEmitTypes,
  orchestrationEventMessage,
} = require("./run-orchestration-sync");

test("lifecycleToOrchestrationStates mapeia fases finais", () => {
  assert.strictEqual(
    lifecycleToOrchestrationStates("execution_completed").orchestrationState,
    "execution_completed",
  );
  assert.strictEqual(
    lifecycleToOrchestrationStates("review_running").orchestrationState,
    "execution_reviewing",
  );
  assert.strictEqual(
    lifecycleToOrchestrationStates("correction_running").orchestrationState,
    "execution_correcting",
  );
});

test("diffEmitTypes emite transições sem spam", () => {
  const base = {
    lifecycle_phase: "execution_running",
    review_status: "none",
    correction_status: "idle",
    correction_generation: 0,
    retry_active: false,
    recovery_status: "none",
  };
  const review = {
    ...base,
    lifecycle_phase: "review_running",
    review_status: "pending",
  };
  const types = diffEmitTypes(base, review, {});
  assert.ok(types.includes("review_started"));
  assert.ok(!types.includes("execution_completed"));

  const rejected = { ...review, review_status: "rejected" };
  const t2 = diffEmitTypes(review, rejected, {});
  assert.ok(t2.includes("review_rejected"));

  const done = { ...base, lifecycle_phase: "execution_completed" };
  const t3 = diffEmitTypes(base, done, { terminal: true });
  assert.ok(t3.includes("execution_completed"));
});

test("orchestrationEventMessage cobre tipos principais", () => {
  const snap = snapshotFromBundle(null);
  assert.ok(orchestrationEventMessage("correction_started", snap).includes("Correcção"));
  assert.ok(orchestrationEventMessage("execution_failed", snap).includes("falha"));
});
