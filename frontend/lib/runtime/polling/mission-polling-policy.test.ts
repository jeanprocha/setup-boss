import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executionPollIntervalMs,
  governanceQueryEnabled,
  preRunDiagnosticsPollPolicy,
  runtimeEventsPollIntervalMs,
} from "./mission-polling-policy.ts";

describe("preRunDiagnosticsPollPolicy", () => {
  it("desactiva poll com run activa", () => {
    const r = preRunDiagnosticsPollPolicy({
      reachable: true,
      hasProject: true,
      hasActiveRun: true,
    });
    assert.equal(r.enabled, false);
    assert.equal(r.intervalMs, false);
  });

  it("activa poll sem run activa", () => {
    const r = preRunDiagnosticsPollPolicy({
      reachable: true,
      hasProject: true,
      hasActiveRun: false,
    });
    assert.equal(r.enabled, true);
    assert.equal(r.intervalMs, 15_000);
  });
});

describe("governanceQueryEnabled", () => {
  it("disabled sem projeto válido", () => {
    assert.equal(governanceQueryEnabled({ governanceEnabled: false }), false);
    assert.equal(governanceQueryEnabled({ governanceEnabled: true }), true);
  });
});

describe("runtimeEventsPollIntervalMs", () => {
  it("intervalo maior com SSE connected", () => {
    const withSse = runtimeEventsPollIntervalMs({
      reachable: true,
      ssePhase: "connected",
    });
    const withoutSse = runtimeEventsPollIntervalMs({
      reachable: true,
      ssePhase: "disconnected",
    });
    assert.equal(withSse, 90_000);
    assert.ok(withoutSse !== false);
    assert.ok((withoutSse as number) < (withSse as number));
  });
});

describe("executionPollIntervalMs", () => {
  it("disabled sem run válida", () => {
    assert.equal(
      executionPollIntervalMs({
        reachable: true,
        runKeyValid: false,
        orchestrationActive: true,
        sseConnected: false,
      }),
      false,
    );
  });

  it("poll mais lento com SSE", () => {
    const slow = executionPollIntervalMs({
      reachable: true,
      runKeyValid: true,
      orchestrationActive: true,
      sseConnected: true,
    });
    const fast = executionPollIntervalMs({
      reachable: true,
      runKeyValid: true,
      orchestrationActive: true,
      sseConnected: false,
    });
    assert.ok((slow as number) > (fast as number));
  });
});
