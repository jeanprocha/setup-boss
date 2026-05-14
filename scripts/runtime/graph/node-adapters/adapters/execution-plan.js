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

function createExecutionPlanAdapter() {
  const side_effect_level = SIDE_EFFECT_LEVEL.DISK_ARTIFACT;
  const capabilities = buildCapabilityModel({
    advisory_only: true,
    replay_safe: true,
    deterministic: true,
    side_effect_level,
    supports_resume: false,
    idempotent: true,
  });

  /** @type {import('../execution-contract').NodeAdapterDescriptor} */
  const descriptor = {
    node_id: NODE_ID.EXECUTION_PLAN,
    kind: "execution_plan",
    runtime_type: RUNTIME_TYPE.EXECUTION_PLAN,
    execution_kind: EXECUTION_KIND.SHADOW_ADVISORY,
    inputs_expected: ["run-context.json", "architect-output.md"],
    outputs_expected: ["execution-plan.json", "plan_telemetry"],
    artifacts_produced: ["execution-plan.json"],
    replay_sensitivity: REPLAY_SENSITIVITY.LOW,
    deterministic_boundaries: ["stable_generator_version", "inputs_hash"],
    supports_replay: true,
    supports_resume: false,
    supports_shadow: true,
    side_effect_level,
    capabilities,
  };

  return new RuntimeNodeAdapter(descriptor);
}

module.exports = {
  createExecutionPlanAdapter,
};
