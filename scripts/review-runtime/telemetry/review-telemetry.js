/**
 * Emite eventos de telemetria do review (best-effort; nunca falha).
 */

function emitReviewTelemetry(telemetry, type, payload = {}) {
  if (!telemetry || typeof telemetry.emit !== "function") return;
  try {
    telemetry.emit(`review.${type}`, payload);
  } catch (_) {
    /* ignore */
  }
}

module.exports = { emitReviewTelemetry };
