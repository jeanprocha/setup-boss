/**
 * Telemetria leve por run (in-process). Eventos append-only em memória.
 */
function createTelemetry() {
  const events = [];
  const counts = {
    "cache.hit": 0,
    "cache.miss": 0,
    "file.read": 0,
    "file.write": 0,
    "llm.call": 0,
    "llm.response": 0,
  };

  function emit(type, payload = {}) {
    events.push({ t: Date.now(), type, ...payload });
    if (Object.prototype.hasOwnProperty.call(counts, type)) {
      counts[type] += 1;
    } else {
      const label = String(type);
      counts[label] = (counts[label] || 0) + 1;
    }
  }

  return {
    emit,
    stepStart(name) {
      emit("step.start", { name });
    },
    stepEnd(name) {
      emit("step.end", { name });
    },
    llmCall(meta = {}) {
      counts["llm.call"] += 1;
      emit("llm.call", meta);
    },
    llmResponse(meta = {}) {
      counts["llm.response"] += 1;
      emit("llm.response", meta);
    },
    getCounts() {
      return { ...counts };
    },
    snapshot() {
      return events.slice();
    },
  };
}

module.exports = { createTelemetry };
