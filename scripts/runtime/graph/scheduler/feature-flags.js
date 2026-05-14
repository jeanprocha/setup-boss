"use strict";

const { SCHEDULER_ENV_MODE } = require("./constants");

/**
 * SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER=off (default) | shadow
 * @returns {'off'|'shadow'}
 */
function getExecutionGraphSchedulerModeFromEnv() {
  const raw = process.env.SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER;
  if (raw == null || String(raw).trim() === "") return SCHEDULER_ENV_MODE.OFF;
  const v = String(raw).trim().toLowerCase();
  if (v === SCHEDULER_ENV_MODE.SHADOW) return SCHEDULER_ENV_MODE.SHADOW;
  return SCHEDULER_ENV_MODE.OFF;
}

function isExecutionGraphSchedulerShadowEnabled() {
  return getExecutionGraphSchedulerModeFromEnv() === SCHEDULER_ENV_MODE.SHADOW;
}

module.exports = {
  getExecutionGraphSchedulerModeFromEnv,
  isExecutionGraphSchedulerShadowEnabled,
};
