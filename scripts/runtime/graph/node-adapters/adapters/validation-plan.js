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

function createValidationPlanAdapter() {
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
    node_id: NODE_ID.VALIDATION_PLAN,
    kind: "validation_plan",
    runtime_type: RUNTIME_TYPE.VALIDATION_PLAN,
    execution_kind: EXECUTION_KIND.TARGETING_SHADOW,
    inputs_expected: ["execution-plan.json", "run_context", "reconciliation_optional"],
    outputs_expected: ["validation-targets.json", "validation_graph_manifest"],
    artifacts_produced: ["validation-targets.json"],
    replay_sensitivity: REPLAY_SENSITIVITY.LOW,
    deterministic_boundaries: ["targeting_graph_version"],
    supports_replay: true,
    supports_resume: false,
    supports_shadow: true,
    side_effect_level,
    capabilities,
  };

  return new RuntimeNodeAdapter(descriptor);
}

module.exports = {
  createValidationPlanAdapter,
};
