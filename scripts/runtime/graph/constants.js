"use strict";

/** Fase 4.12.1 — modelo estrutural (shadow). */
const SCHEMA_VERSION = 1;
const ARTIFACT_FILENAME = "execution-graph.json";
const PIPELINE_VARIANT = "linear_v2";
const PHASE_TAG = "4.12.1";

const NODE_ID = {
  SCAN: "n-scan",
  ARCHITECT: "n-architect",
  EXECUTION_PLAN: "n-execution-plan",
  EXECUTOR: "n-executor",
  VALIDATION_PLAN: "n-validation-plan",
  VALIDATOR_EXECUTOR: "n-validator-executor",
  REVIEW: "n-review",
  CORRECTION: "n-correction",
  KNOWLEDGE: "n-knowledge",
};

/** @typedef {'scan'|'architect'|'execution_plan'|'executor'|'validation_plan'|'validator_executor'|'review'|'correction'|'knowledge'} NodeKind */

/** @type {NodeKind[]} */
const NODE_KINDS_ORDER = [
  "scan",
  "architect",
  "execution_plan",
  "executor",
  "validation_plan",
  "validator_executor",
  "review",
  "correction",
  "knowledge",
];

const EDGE_KIND = {
  HARD: "hard",
  SOFT: "soft",
  CONDITIONAL: "conditional",
  REPEAT: "repeat",
};

const NODE_STATUS = {
  PENDING: "pending",
  READY: "ready",
  BLOCKED: "blocked",
};

module.exports = {
  SCHEMA_VERSION,
  ARTIFACT_FILENAME,
  PIPELINE_VARIANT,
  PHASE_TAG,
  NODE_ID,
  NODE_KINDS_ORDER,
  EDGE_KIND,
  NODE_STATUS,
};
