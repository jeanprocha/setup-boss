/**
 * Backoff exponencial leve com jitter — evita thundering herd em rate limits.
 */

function jitterMs(base) {
  const j = Math.floor(base * 0.15 * Math.random());
  return base + j;
}

function computeBackoffDelayMs(attemptIndex, baseMs = 800, maxMs = 12_000) {
  const a = Math.max(1, attemptIndex);
  const raw = Math.min(maxMs, baseMs * 2 ** (a - 1));
  return jitterMs(raw);
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  computeBackoffDelayMs,
  sleepMs,
  jitterMs,
};
