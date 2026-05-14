/**
 * Telemetria NDJSON + espelho em ctx.telemetry (best-effort, nunca falha).
 */

const fs = require("fs");
const path = require("path");
const { GOVERNANCE_RUNTIME_TELEMETRY_FILENAME } = require("./governance-runtime-constants");

function createGovernanceRuntimeNdjsonSink(outputDir) {
  const dir = String(outputDir || "");
  if (!dir) {
    return {
      appendNdjson() {},
    };
  }
  const filePath = path.join(dir, GOVERNANCE_RUNTIME_TELEMETRY_FILENAME);
  return {
    appendNdjson(record) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const line = `${JSON.stringify(record)}\n`;
      fs.appendFileSync(filePath, line, "utf8");
    },
  };
}

function emitGovernanceRuntimeTelemetry(telemetry, sink, kind, payload = {}) {
  const body = {
    ts: new Date().toISOString(),
    kind: String(kind || ""),
    ...payload,
  };
  try {
    if (telemetry && typeof telemetry.emit === "function") {
      telemetry.emit(String(kind || ""), payload);
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (sink && typeof sink.appendNdjson === "function") sink.appendNdjson(body);
  } catch (_) {
    /* ignore */
  }
}

module.exports = {
  createGovernanceRuntimeNdjsonSink,
  emitGovernanceRuntimeTelemetry,
};
