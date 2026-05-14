"use strict";

const { OVERLAY_MODE } = require("./constants");

/**
 * SETUP_BOSS_EXECUTION_GRAPH_OVERLAY=off (default) | shadow
 * @returns {'off'|'shadow'}
 */
function getExecutionGraphOverlayModeFromEnv() {
  const raw = process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY;
  if (raw == null || String(raw).trim() === "") return OVERLAY_MODE.OFF;
  const v = String(raw).trim().toLowerCase();
  if (v === OVERLAY_MODE.SHADOW) return OVERLAY_MODE.SHADOW;
  return OVERLAY_MODE.OFF;
}

function isExecutionGraphOverlayShadowEnabled() {
  return getExecutionGraphOverlayModeFromEnv() === OVERLAY_MODE.SHADOW;
}

module.exports = {
  getExecutionGraphOverlayModeFromEnv,
  isExecutionGraphOverlayShadowEnabled,
};
