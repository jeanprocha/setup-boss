/**
 * Telemetry best-effort (NDJSON persistente opcional — nunca falha).
 */

function emitCorrectionTelemetry(sink, telemetry, type, payload = {}) {
  const body = {
    ts: new Date().toISOString(),
    kind: String(type || ""),
    ...payload,
  };

  try {
    if (telemetry && typeof telemetry.emit === "function") telemetry.emit(`correction.${type}`, payload);
  } catch (_) {}

  try {
    if (sink && typeof sink.appendNdjson === "function") sink.appendNdjson(body);
  } catch (_) {}
}

module.exports = {
  emitCorrectionTelemetry,
};
