import assert from "node:assert";
import { describe, it } from "node:test";
import { shouldShowStrategyProcessingUi } from "./is-ui-processing";

describe("shouldShowStrategyProcessingUi", () => {
  it("false quando strategy pronta", () => {
    assert.equal(
      shouldShowStrategyProcessingUi({
        heroActive: true,
        strategyReady: true,
        needsRetry: false,
        strategyRuntimePhase: "strategy_ready",
      }),
      false,
    );
  });

  it("false quando run terminal success", () => {
    assert.equal(
      shouldShowStrategyProcessingUi({
        heroActive: true,
        strategyReady: false,
        needsRetry: false,
        runState: "success",
        strategyRuntimePhase: "strategy_pending",
      }),
      false,
    );
  });

  it("true quando hero activo e strategy em curso", () => {
    assert.equal(
      shouldShowStrategyProcessingUi({
        heroActive: true,
        strategyReady: false,
        needsRetry: false,
        runState: "running",
        strategyRuntimePhase: "strategy_generating",
      }),
      true,
    );
  });
});
