import assert from "node:assert/strict";
import test from "node:test";
import { RUNTIME_LOGS_SCROLL_CLASS } from "@/components/features/observability/RuntimeObservabilityLogs";

test("RUNTIME_LOGS_SCROLL_CLASS inclui overflow-y e flex-1", () => {
  assert.ok(RUNTIME_LOGS_SCROLL_CLASS.includes("overflow-y-auto"));
  assert.ok(RUNTIME_LOGS_SCROLL_CLASS.includes("flex-1"));
  assert.ok(RUNTIME_LOGS_SCROLL_CLASS.includes("min-h-0"));
});
