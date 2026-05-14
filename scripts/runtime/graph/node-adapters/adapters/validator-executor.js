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

function createValidatorExecutorAdapter() {
  const side_effect_level = SIDE_EFFECT_LEVEL.DISK_ARTIFACT;
  const capabilities = buildCapabilityModel({
    advisory_only: false,
    replay_safe: true,
    deterministic: true,
    side_effect_level,
    supports_resume: true,
    idempotent: true,
  });

  /** @type {import('../execution-contract').NodeAdapterDescriptor} */
  const descriptor = {
    node_id: NODE_ID.VALIDATOR_EXECUTOR,
    kind: "validator_executor",
    runtime_type: RUNTIME_TYPE.VALIDATOR_EXECUTOR,
    execution_kind: EXECUTION_KIND.PIPELINE_STEP,
    inputs_expected: ["validation-targets.json", "plan", "policy_profile"],
    outputs_expected: ["validation-results.json", "validation_runtime_manifest"],
    artifacts_produced: ["validation-results.json"],
    replay_sensitivity: REPLAY_SENSITIVITY.LOW,
    deterministic_boundaries: ["validator_commands", "validation_run_id"],
    supports_replay: true,
    supports_resume: true,
    supports_shadow: false,
    side_effect_level,
    capabilities,
  };

  return new RuntimeNodeAdapter(descriptor);
}

module.exports = {
  createValidatorExecutorAdapter,
};
