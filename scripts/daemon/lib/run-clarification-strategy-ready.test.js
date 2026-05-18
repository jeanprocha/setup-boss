"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  mapPhase2ToRuntimePhase,
  isStrategyReadyOnDisk,
} = require("./run-clarification");

test("mapPhase2ToRuntimePhase: artifacts prontos + phase3 intermediário → ready_for_execution", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-clar-map-"));
  const strategyDir = path.join(root, "strategy");
  fs.mkdirSync(strategyDir, { recursive: true });
  fs.writeFileSync(
    path.join(strategyDir, "strategy-readiness.json"),
    JSON.stringify({ status: "strategy_ready", validation: { valid: true } }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(strategyDir, "execution-ready-handoff.json"),
    JSON.stringify({ status: "execution_ready_handoff_completed" }),
    "utf-8",
  );

  const runContext = {
    phase2: { status: "ready_for_execution" },
    phase3: {
      status: "strategy_runtime_initialized",
      readiness: { status: "strategy_ready" },
      handoff: { status: "execution_ready_handoff_completed" },
    },
  };

  const phase = mapPhase2ToRuntimePhase(
    "ready_for_execution",
    { status: "approved" },
    0,
    runContext,
    0,
    root,
  );
  assert.strictEqual(phase, "ready_for_execution");
  assert.strictEqual(isStrategyReadyOnDisk(root), true);
});

test("mapPhase2ToRuntimePhase: sem artifacts → strategy_pending", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-clar-pend-"));
  const runContext = {
    phase2: { status: "ready_for_execution" },
    phase3: { status: "strategy_runtime_initialized" },
  };
  const phase = mapPhase2ToRuntimePhase(
    "ready_for_execution",
    { status: "approved" },
    0,
    runContext,
    0,
    root,
  );
  assert.strictEqual(phase, "strategy_pending");
});
