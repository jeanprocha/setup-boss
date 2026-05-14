/**
 * Telemetria nomeada — Validation Runtime (Fase 4.2).
 */

/**
 * @param {{ emit?: Function }|null|undefined} telemetry
 * @param {string} name
 * @param {object} data
 */
function emitValidationRuntimeEvent(telemetry, name, data = {}) {
  if (!telemetry || typeof telemetry.emit !== "function") return;
  try {
    telemetry.emit(name, {
      ...data,
      t_validation_runtime: Date.now(),
    });
  } catch (_) {
    /* best-effort */
  }
}

/**
 * @param {object[]} sink
 * @param {string} name
 * @param {object} data
 */
function appendTelemetryRecord(sink, name, data = {}) {
  if (!Array.isArray(sink)) return;
  sink.push({
    name,
    at: new Date().toISOString(),
    data: data && typeof data === "object" ? data : {},
  });
}

module.exports = {
  emitValidationRuntimeEvent,
  appendTelemetryRecord,
};
