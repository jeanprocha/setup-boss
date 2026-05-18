"use strict";

const { appendDaemonLog } = require("./daemon-log");

let connectedClients = 0;
let eventsEmitted = 0;

/**
 * @returns {{ connectedClients: number, eventsEmitted: number }}
 */
function getSseObservabilityMetrics() {
  return { connectedClients, eventsEmitted };
}

function logSseClients() {
  appendDaemonLog(
    `workspace_run_sse.clients connected=${connectedClients} eventsEmitted=${eventsEmitted}`,
  );
}

function registerSseStreamClient() {
  connectedClients += 1;
  logSseClients();
}

function unregisterSseStreamClient() {
  if (connectedClients > 0) connectedClients -= 1;
  logSseClients();
}

function recordSseEventEmitted() {
  eventsEmitted += 1;
}

module.exports = {
  getSseObservabilityMetrics,
  registerSseStreamClient,
  unregisterSseStreamClient,
  recordSseEventEmitted,
};
