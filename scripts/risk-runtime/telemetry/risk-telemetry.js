/**
 * Eventos nomeados de risco (plan-telemetry + bridge opcional).
 */

const { emitPlanTelemetryEvent } = require("../../execution-plan/telemetry/plan-telemetry");
const { RISK_SIGNAL_SOURCE } = require("../constants");

/**
 * @param {object|null} telemetry
 * @param {string} name
 * @param {object} data
 */
function emitRiskTelemetry(telemetry, name, data = {}) {
  emitPlanTelemetryEvent(telemetry, name, {
    source: RISK_SIGNAL_SOURCE.ENGINE,
    ...data,
  });
}

module.exports = {
  emitRiskTelemetry,
};
