"use strict";

/**
 * SETUP_BOSS_EXECUTION_GRAPH_RUNTIME=off (default) | shadow
 * @returns {'off'|'shadow'}
 */
function getExecutionGraphRuntimeModeFromEnv() {
  const raw = process.env.SETUP_BOSS_EXECUTION_GRAPH_RUNTIME;
  if (raw == null || String(raw).trim() === "") return "off";
  const v = String(raw).trim().toLowerCase();
  if (v === "shadow") return "shadow";
  return "off";
}

function isExecutionGraphRuntimeShadowEnabled() {
  return getExecutionGraphRuntimeModeFromEnv() === "shadow";
}

module.exports = {
  getExecutionGraphRuntimeModeFromEnv,
  isExecutionGraphRuntimeShadowEnabled,
};
