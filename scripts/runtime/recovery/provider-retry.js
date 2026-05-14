/**
 * Retry seguro para chamadas OpenAI responses.create (executor).
 */

const { computeBackoffDelayMs, sleepMs } = require("./backoff");
const { classifyProviderError } = require("./failure-classifier");
const { appendHistoryEntry } = require("./recovery-artifacts");

async function withOpenAIResponsesRetry(fn, opts = {}) {
  const {
    telemetry,
    outputDir,
    step = "executor",
    maxAttempts = 3,
    onBeforeSleep,
  } = opts;

  let lastErr = null;
  const cap = Math.max(1, Number(maxAttempts) || 1);

  for (let attempt = 1; attempt <= cap; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fn();
      if (telemetry && typeof telemetry.emit === "function") {
        telemetry.emit("recovery.provider_attempt", {
          step,
          attempt,
          success: true,
          latency_ms: Date.now() - t0,
        });
      }
      return res;
    } catch (err) {
      lastErr = err;
      const c = classifyProviderError(err);
      const retryable = c.retryable === true && attempt < cap;

      if (outputDir) {
        appendHistoryEntry(outputDir, {
          kind: "provider",
          step,
          attempt,
          success: false,
          classification: c.classification,
          subtype: c.subtype,
          retryable,
          latency_ms: Date.now() - t0,
          message: String(err.message || err).slice(0, 800),
        });
      }

      if (telemetry && typeof telemetry.emit === "function") {
        telemetry.emit("recovery.provider_attempt", {
          step,
          attempt,
          success: false,
          classification: c.classification,
          retryable,
          latency_ms: Date.now() - t0,
        });
      }

      if (!retryable) break;

      const delay = computeBackoffDelayMs(attempt);
      if (typeof onBeforeSleep === "function") {
        onBeforeSleep({ attempt, delay_ms: delay, classification: c.classification });
      }
      await sleepMs(delay);
    }
  }

  throw lastErr;
}

module.exports = {
  withOpenAIResponsesRetry,
};
