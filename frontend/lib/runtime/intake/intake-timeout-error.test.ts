import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import {
  buildIntakeTimeoutStructuredError,
  INTAKE_TIMEOUT_CODE,
  intakeTimeoutBody,
  intakeTimeoutTitle,
  isAbortTimeoutMessage,
  isIntakeTimeoutError,
} from "./intake-timeout-error.ts";

test("isAbortTimeoutMessage reconhece mensagem do proxy", () => {
  assert.ok(
    isAbortTimeoutMessage("The operation was aborted due to timeout"),
  );
  assert.ok(isAbortTimeoutMessage("Timeout ao contactar runtime"));
});

test("isIntakeTimeoutError: RuntimeApiError timeout", () => {
  assert.ok(
    isIntakeTimeoutError(
      new RuntimeApiError("Timeout ao contactar runtime", "timeout"),
    ),
  );
});

test("buildIntakeTimeoutStructuredError: código e fase submit", () => {
  const err = buildIntakeTimeoutStructuredError({
    projectId: "proj_a",
    selectedProjectId: "proj_a",
    endpoint: "POST /runs",
    timeoutMs: 15_000,
    rawMessage: "The operation was aborted due to timeout",
  });
  assert.strictEqual(err.code, INTAKE_TIMEOUT_CODE);
  assert.strictEqual(err.phase, "submit");
  assert.strictEqual(err.title, intakeTimeoutTitle());
  assert.strictEqual(err.message, intakeTimeoutBody());
  assert.ok(err.details);
});
