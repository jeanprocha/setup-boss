"use strict";

const { REPLAY_MODE } = require("./constants");

/**
 * SETUP_BOSS_EXECUTION_GRAPH_REPLAY=off (default) | shadow
 * @returns {'off'|'shadow'}
 */
function getExecutionGraphReplayModeFromEnv() {
  const raw = process.env.SETUP_BOSS_EXECUTION_GRAPH_REPLAY;
  if (raw == null || String(raw).trim() === "") return REPLAY_MODE.OFF;
  const v = String(raw).trim().toLowerCase();
  if (v === REPLAY_MODE.SHADOW) return REPLAY_MODE.SHADOW;
  return REPLAY_MODE.OFF;
}

function isExecutionGraphReplayShadowEnabled() {
  return getExecutionGraphReplayModeFromEnv() === REPLAY_MODE.SHADOW;
}

module.exports = {
  getExecutionGraphReplayModeFromEnv,
  isExecutionGraphReplayShadowEnabled,
};
