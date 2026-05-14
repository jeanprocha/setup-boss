"use strict";

/** Contrato execution-graph-replay-report.json (Fase 4.12.6). */
const REPLAY_REPORT_SCHEMA_VERSION = 1;
const REPLAY_ARTIFACT_FILENAME = "execution-graph-replay-report.json";
const REPLAY_PHASE_TAG = "4.12.6";

const REPLAY_MODE = {
  OFF: "off",
  SHADOW: "shadow",
};

/** Estados advisory por nó no plano de replay (mutuamente exclusivos quando aplicável). */
const REPLAY_NODE_STATUS = {
  REPLAY_SAFE: "replay_safe",
  REPLAY_BLOCKED: "replay_blocked",
  REPLAY_REQUIRED: "replay_required",
  REPLAY_OPTIONAL: "replay_optional",
  REPLAY_BOUNDARY: "replay_boundary",
};

module.exports = {
  REPLAY_REPORT_SCHEMA_VERSION,
  REPLAY_ARTIFACT_FILENAME,
  REPLAY_PHASE_TAG,
  REPLAY_MODE,
  REPLAY_NODE_STATUS,
};
