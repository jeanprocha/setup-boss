import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPhase3StatusToRuntimePhase } from "@/lib/runtime/strategy/strategy-state";

describe("mapPhase3StatusToRuntimePhase", () => {
  it("operationalReadiness ready + strategy_runtime_initialized → strategy_ready", () => {
    assert.equal(
      mapPhase3StatusToRuntimePhase("strategy_runtime_initialized", "ready", 0),
      "strategy_ready",
    );
  });

  it("operationalReadiness ready + ready_for_execution → ready_for_execution", () => {
    assert.equal(
      mapPhase3StatusToRuntimePhase("ready_for_execution", "ready", 0),
      "ready_for_execution",
    );
  });
});
