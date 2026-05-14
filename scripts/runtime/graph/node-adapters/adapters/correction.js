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

function createCorrectionAdapter() {
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
    node_id: NODE_ID.CORRECTION,
    kind: "correction",
    runtime_type: RUNTIME_TYPE.CORRECTION,
    execution_kind: EXECUTION_KIND.LOOP_CONDITIONAL,
    inputs_expected: ["review_failure_context", "correction_iteration", "suppression_gate"],
    outputs_expected: ["correction-instructions.md", "correction_runtime_artifacts"],
    artifacts_produced: ["correction-instructions.md"],
    replay_sensitivity: REPLAY_SENSITIVITY.MEDIUM,
    deterministic_boundaries: ["failure_fingerprint", "correction_iteration_cap"],
    supports_replay: true,
    supports_resume: true,
    supports_shadow: false,
    side_effect_level,
    capabilities,
  };

  return new RuntimeNodeAdapter(descriptor);
}

module.exports = {
  createCorrectionAdapter,
};
