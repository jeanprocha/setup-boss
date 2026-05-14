#!/usr/bin/env node
/**
 * Testes do subsistema de recovery (sem LLM).
 * Executar: node scripts/runtime/recovery/recovery.test.js
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { computeBackoffDelayMs } = require("./backoff");
const { createBudgetSession } = require("./retry-budget");
const {
  classifyProviderError,
  classifyExecutorBlockedJson,
} = require("./failure-classifier");
const { resolveStrategy } = require("./recovery-strategies");
const {
  appendHistoryEntry,
  summarizeRecoveryFromArtifacts,
  finalizeLogSession,
} = require("./recovery-artifacts");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-recovery-"));
}

(() => {
  const b1 = computeBackoffDelayMs(1, 100, 10_000);
  const b2 = computeBackoffDelayMs(2, 100, 10_000);
  assert.ok(b2 >= b1);

  const budget = createBudgetSession({
    executor_micro_retry: 2,
    provider_retry: 3,
    correction_retry: 1,
  });
  assert.strictEqual(budget.consume("executor_micro_retry"), true);
  assert.strictEqual(budget.consume("executor_micro_retry"), true);
  assert.strictEqual(budget.consume("executor_micro_retry"), false);

  const p429 = classifyProviderError({ status: 429, message: "rate" });
  assert.strictEqual(p429.retryable, true);
  assert.strictEqual(p429.classification, "PROVIDER_FAILURE");

  const pErr = classifyProviderError({ message: "invalid api key" });
  assert.strictEqual(pErr.retryable, false);

  const exBlocked = {
    status: "blocked",
    blocked_reason:
      "Patch não pôde ser aplicado com segurança. trecho search não encontrado no arquivo real.",
    evidence: [],
    changes: [],
  };
  const fc = classifyExecutorBlockedJson(exBlocked);
  assert.strictEqual(fc.retryable_micro, true);
  const strat = resolveStrategy(fc);
  assert.ok(strat.snippetTuning.windowMultiplier > 1);

  const d = tmpDir();
  appendHistoryEntry(d, {
    kind: "executor_micro",
    success: false,
  });
  appendHistoryEntry(d, {
    kind: "provider",
    success: true,
  });
  finalizeLogSession(d, "rid-1", { final_outcome: "RECOVERED_SUCCESSFULLY" });
  const sum = summarizeRecoveryFromArtifacts(d);
  assert.strictEqual(sum.executor_micro_retries, 1);
  assert.strictEqual(sum.provider_retries, 1);
  assert.strictEqual(sum.final_outcome, "RECOVERED_SUCCESSFULLY");

  console.log("recovery.test.js: OK");
})();
