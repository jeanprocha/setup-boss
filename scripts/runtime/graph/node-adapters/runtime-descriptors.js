"use strict";

/**
 * Níveis de sensibilidade a replay (documental; não executa replay).
 * @typedef {'high'|'medium'|'low'} ReplaySensitivity
 */

/**
 * @typedef {'none'|'read_only'|'disk_artifact'|'llm'|'repo_mutation'|'project_write'} SideEffectLevel
 */

/**
 * @typedef {'pipeline_step'|'shadow_advisory'|'targeting_shadow'|'loop_conditional'} ExecutionKind
 */

const REPLAY_SENSITIVITY = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

const SIDE_EFFECT_LEVEL = {
  NONE: "none",
  READ_ONLY: "read_only",
  DISK_ARTIFACT: "disk_artifact",
  LLM: "llm",
  REPO_MUTATION: "repo_mutation",
  PROJECT_WRITE: "project_write",
};

const EXECUTION_KIND = {
  PIPELINE_STEP: "pipeline_step",
  SHADOW_ADVISORY: "shadow_advisory",
  TARGETING_SHADOW: "targeting_shadow",
  LOOP_CONDITIONAL: "loop_conditional",
};

/** Identificadores estáveis do “runtime” alvo (metadado; não importa módulos). */
const RUNTIME_TYPE = {
  SCAN: "scan",
  ARCHITECT: "architect",
  EXECUTION_PLAN: "execution_plan_shadow",
  EXECUTOR: "executor",
  VALIDATION_PLAN: "validation_targeting_shadow",
  VALIDATOR_EXECUTOR: "validation_runtime",
  REVIEW: "review",
  CORRECTION: "correction",
  KNOWLEDGE: "knowledge",
};

module.exports = {
  REPLAY_SENSITIVITY,
  SIDE_EFFECT_LEVEL,
  EXECUTION_KIND,
  RUNTIME_TYPE,
};
