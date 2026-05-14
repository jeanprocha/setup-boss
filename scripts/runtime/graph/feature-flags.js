"use strict";

/**
 * SETUP_BOSS_EXECUTION_GRAPH=off (default) | shadow
 * @returns {'off'|'shadow'}
 */
function getExecutionGraphModeFromEnv() {
  const raw = process.env.SETUP_BOSS_EXECUTION_GRAPH;
  if (raw == null || String(raw).trim() === "") return "off";
  const v = String(raw).trim().toLowerCase();
  if (v === "shadow") return "shadow";
  return "off";
}

function isExecutionGraphShadowEnabled() {
  return getExecutionGraphModeFromEnv() === "shadow";
}

module.exports = {
  getExecutionGraphModeFromEnv,
  isExecutionGraphShadowEnabled,
};
