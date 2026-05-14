"use strict";

const { RELEASE_READINESS_ENV } = require("./constants");

/**
 * SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS=off (default) | shadow
 * @returns {'off'|'shadow'}
 */
function getExecutionGraphReleaseReadinessModeFromEnv() {
  const raw = process.env[RELEASE_READINESS_ENV];
  if (raw == null || String(raw).trim() === "") return "off";
  const x = String(raw).toLowerCase().trim();
  if (x === "shadow") return "shadow";
  return "off";
}

function isExecutionGraphReleaseReadinessShadowEnabled() {
  return getExecutionGraphReleaseReadinessModeFromEnv() === "shadow";
}

module.exports = {
  getExecutionGraphReleaseReadinessModeFromEnv,
  isExecutionGraphReleaseReadinessShadowEnabled,
};
