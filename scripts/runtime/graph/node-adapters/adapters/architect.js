"use strict";

const { NODE_ID } = require("../../constants");
const { RuntimeNodeAdapter } = require("../adapter-base");
const { buildCapabilityModel } = require("../capability-model");
const {
  RUNTIME_TYPE,
  EXECUTION_KIND,
  REPLAY_SENSITIVITY,
  SIDE_EFFECT_LEVEL,
} = require("../runtime-descriptors");

function createArchitectAdapter() {
  const side_effect_level = SIDE_EFFECT_LEVEL.LLM;
  const capabilities = buildCapabilityModel({
    advisory_only: false,
    replay_safe: true,
    deterministic: false,
    side_effect_level,
    supports_resume: true,
    idempotent: false,
  });

  /** @type {import('../execution-contract').NodeAdapterDescriptor} */
  const descriptor = {
    node_id: NODE_ID.ARCHITECT,
    kind: "architect",
    runtime_type: RUNTIME_TYPE.ARCHITECT,
    execution_kind: EXECUTION_KIND.PIPELINE_STEP,
    inputs_expected: ["task_md", "scan-output.md", "run_flags"],
    outputs_expected: [
      "architect-output.md",
      "run-context.json",
      "metadata.json",
      "architect-validation.json",
    ],
    artifacts_produced: [
      "architect-output.md",
      "run-context.json",
      "architect-validation.json",
    ],
    replay_sensitivity: REPLAY_SENSITIVITY.MEDIUM,
    deterministic_boundaries: ["frozen_task_hash", "governance_profile"],
    supports_replay: true,
    supports_resume: true,
    supports_shadow: true,
    side_effect_level,
    capabilities,
  };

  return new RuntimeNodeAdapter(descriptor);
}

module.exports = {
  createArchitectAdapter,
};
