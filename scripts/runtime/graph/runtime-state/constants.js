"use strict";

/** Contrato execution-graph-runtime.json (Fase 4.12.2). */
const RUNTIME_ARTIFACT_SCHEMA_VERSION = 1;
const RUNTIME_ARTIFACT_FILENAME = "execution-graph-runtime.json";
const RUNTIME_PHASE_TAG = "4.12.2";

const RUNTIME_NODE_STATUS = {
  PENDING: "pending",
  READY: "ready",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
  BLOCKED: "blocked",
};

/** @type {Set<string>} */
const ALL_RUNTIME_STATUSES = new Set(Object.values(RUNTIME_NODE_STATUS));

/** Terminais: sem transição para estados operacionais. */
const TERMINAL_RUNTIME_STATUSES = new Set([
  RUNTIME_NODE_STATUS.COMPLETED,
  RUNTIME_NODE_STATUS.FAILED,
  RUNTIME_NODE_STATUS.SKIPPED,
  RUNTIME_NODE_STATUS.BLOCKED,
]);

module.exports = {
  RUNTIME_ARTIFACT_SCHEMA_VERSION,
  RUNTIME_ARTIFACT_FILENAME,
  RUNTIME_PHASE_TAG,
  RUNTIME_NODE_STATUS,
  ALL_RUNTIME_STATUSES,
  TERMINAL_RUNTIME_STATUSES,
};
