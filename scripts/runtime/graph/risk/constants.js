"use strict";

const RISK_REPORT_SCHEMA_VERSION = 1;
const RISK_ARTIFACT_FILENAME = "execution-graph-risk-report.json";
const RISK_PHASE_TAG = "4.12.8";

const RISK_LEVEL = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

const RISK_CATEGORY = {
  GRAPH_INTEGRITY: "graph_integrity",
  RUNTIME_CONSISTENCY: "runtime_consistency",
  REPLAY_CONSISTENCY: "replay_consistency",
  DEPENDENCY_RESOLUTION: "dependency_resolution",
  SCHEDULER_CONSISTENCY: "scheduler_consistency",
  TRANSITION_CONSISTENCY: "transition_consistency",
};

const RISK_MODE = {
  OFF: "off",
  SHADOW: "shadow",
};

module.exports = {
  RISK_REPORT_SCHEMA_VERSION,
  RISK_ARTIFACT_FILENAME,
  RISK_PHASE_TAG,
  RISK_LEVEL,
  RISK_CATEGORY,
  RISK_MODE,
};
