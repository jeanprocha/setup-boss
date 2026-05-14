/**
 * Telemetria nomeada para validation targeting (emite via ctx.telemetry + registo no manifest).
 */

/**
 * @param {{ emit?: Function }|null|undefined} telemetry
 * @param {string} name
 * @param {object} data
 */
function emitValidationTargetingEvent(telemetry, name, data = {}) {
  if (!telemetry || typeof telemetry.emit !== "function") return;
  try {
    telemetry.emit(name, {
      ...data,
      t_validation_targeting: Date.now(),
    });
  } catch (_) {
    /* best-effort */
  }
}

module.exports = {
  emitValidationTargetingEvent,
};
