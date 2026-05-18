"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  getSseObservabilityMetrics,
  registerSseStreamClient,
  unregisterSseStreamClient,
  recordSseEventEmitted,
} = require("./sse-observability");

test("métricas SSE clients e eventos", () => {
  const before = getSseObservabilityMetrics();
  registerSseStreamClient();
  registerSseStreamClient();
  recordSseEventEmitted();
  recordSseEventEmitted();
  recordSseEventEmitted();
  const mid = getSseObservabilityMetrics();
  assert.strictEqual(mid.connectedClients, before.connectedClients + 2);
  assert.strictEqual(mid.eventsEmitted, before.eventsEmitted + 3);
  unregisterSseStreamClient();
  const after = getSseObservabilityMetrics();
  assert.strictEqual(after.connectedClients, before.connectedClients + 1);
});
