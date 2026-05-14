/**
 * Telemetria de alto nível para Execution Plan (eventos nomeados).
 */

/**
 * @param {{ emit?: Function }|null|undefined} telemetry
 * @param {string} name
 * @param {object} data
 */
function emitPlanTelemetryEvent(telemetry, name, data = {}) {
  if (!telemetry || typeof telemetry.emit !== "function") return;
  try {
    telemetry.emit(name, {
      ...data,
      t_plan: Date.now(),
    });
  } catch (_) {
    /* nunca quebrar pipeline */
  }
}

/**
 * @param {object} plan
 * @param {string} name
 * @param {object} data
 */
function appendPlanTelemetryRecord(plan, name, data = {}) {
  if (!plan || typeof plan !== "object") return plan;
  const tel = plan.telemetry && typeof plan.telemetry === "object" ? plan.telemetry : { events: [] };
  const events = Array.isArray(tel.events) ? tel.events.slice() : [];
  events.push({
    name,
    at: new Date().toISOString(),
    data,
  });
  return {
    ...plan,
    telemetry: {
      ...tel,
      events,
    },
  };
}

module.exports = {
  emitPlanTelemetryEvent,
  appendPlanTelemetryRecord,
};
