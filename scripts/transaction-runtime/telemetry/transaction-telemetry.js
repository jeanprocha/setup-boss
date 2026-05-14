/**
 * Eventos append-only em NDJSON.
 */

const fs = require("fs");
const path = require("path");

const { TELEMETRY_FILENAME } = require("../constants");
const { getTransactionRuntimeMode } = require("../feature-flags");

function appendEvent(outputDir, event) {
  const dir = String(outputDir || "");
  if (!dir) return;
  const line = JSON.stringify({
    ...event,
    ts: new Date().toISOString(),
    env_mode: getTransactionRuntimeMode(),
  });
  const p = path.join(dir, TELEMETRY_FILENAME);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(p, `${line}\n`, "utf8");
  } catch (_) {
    /* nunca interrompe pipeline */
  }
}

module.exports = {
  appendEvent,
};
