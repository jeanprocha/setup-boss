"use strict";

const { RISK_MODE } = require("./constants");

function getExecutionGraphRiskModeFromEnv() {
  const raw = process.env.SETUP_BOSS_EXECUTION_GRAPH_RISK;
  if (raw == null || String(raw).trim() === "") return RISK_MODE.OFF;
  const v = String(raw).trim().toLowerCase();
  if (v === RISK_MODE.SHADOW) return RISK_MODE.SHADOW;
  return RISK_MODE.OFF;
}

function isExecutionGraphRiskShadowEnabled() {
  return getExecutionGraphRiskModeFromEnv() === RISK_MODE.SHADOW;
}

module.exports = {
  getExecutionGraphRiskModeFromEnv,
  isExecutionGraphRiskShadowEnabled,
};
