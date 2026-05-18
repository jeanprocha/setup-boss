import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIntakeTimeoutStructuredError,
  INTAKE_TIMEOUT_CODE,
} from "@/lib/runtime/intake/intake-timeout-error";
import {
  logIntakeStartFailure,
  useUiDiagnosticsStore,
} from "./ui-diagnostics-store";

test("logIntakeStartFailure com INTAKE_TIMEOUT aparece nos diagnostics", () => {
  useUiDiagnosticsStore.getState().clear();
  const preRun = buildIntakeTimeoutStructuredError({
    projectId: "proj_test",
    endpoint: "POST /runs",
    timeoutMs: 15_000,
    rawMessage: "The operation was aborted due to timeout",
  });
  logIntakeStartFailure({
    projectId: "proj_test",
    selectedProjectId: "proj_test",
    endpoint: "POST /runs",
    status: 0,
    apiMessage: "The operation was aborted due to timeout",
    phase: "submit",
    preRun,
    timeoutMs: 15_000,
  });
  const entries = useUiDiagnosticsStore.getState().entries;
  assert.ok(entries.length >= 1);
  const last = entries[entries.length - 1];
  assert.match(last.message, /Tempo limite/i);
  assert.strictEqual(last.preRun?.code, INTAKE_TIMEOUT_CODE);
  assert.strictEqual(last.preRun?.phase, "submit");
});
