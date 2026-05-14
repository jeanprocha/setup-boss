"use strict";

const { NODE_ADAPTERS_MODE } = require("./constants");

/**
 * SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS=off (default) | shadow
 * @returns {'off'|'shadow'}
 */
function getExecutionGraphNodeAdaptersModeFromEnv() {
  const raw = process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS;
  if (raw == null || String(raw).trim() === "") return NODE_ADAPTERS_MODE.OFF;
  const v = String(raw).trim().toLowerCase();
  if (v === NODE_ADAPTERS_MODE.SHADOW) return NODE_ADAPTERS_MODE.SHADOW;
  return NODE_ADAPTERS_MODE.OFF;
}

function isExecutionGraphNodeAdaptersShadowEnabled() {
  return getExecutionGraphNodeAdaptersModeFromEnv() === NODE_ADAPTERS_MODE.SHADOW;
}

module.exports = {
  getExecutionGraphNodeAdaptersModeFromEnv,
  isExecutionGraphNodeAdaptersShadowEnabled,
};
